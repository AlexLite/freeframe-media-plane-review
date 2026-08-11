from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
import uuid
import secrets
from datetime import datetime, timedelta, timezone
from ..database import get_db
from ..schemas.auth import (
    RegisterRequest, LoginRequest, TokenResponse,
    RefreshRequest, UserResponse, InviteRequest,
    SendMagicCodeRequest, SendMagicCodeResponse,
    VerifyMagicCodeRequest, SetPasswordRequest,
    AcceptInviteRequest, InviteInfoResponse,
    DeviceStartRequest, DeviceStartResponse, DevicePollRequest, DeviceTokenResponse, DeviceApproveRequest,
)
from ..services.auth_service import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_token,
    get_user_by_email, get_user_by_id,
)
from ..services.redis_service import (
    generate_magic_code, store_magic_code, verify_magic_code as redis_verify_magic_code,
    MAGIC_CODE_EXPIRY_SECONDS,
    create_device_authorization, approve_device_authorization, poll_device_authorization,
    DEVICE_FLOW_EXPIRY_SECONDS, DEVICE_POLL_INTERVAL_SECONDS,
)
from ..tasks.email_tasks import send_magic_code_email, send_invite_email
from ..tasks.celery_app import send_task_safe
from ..models.user import User, UserStatus
from ..middleware.auth import get_current_user
from ..middleware.rate_limit import rate_limit
from ..config import settings

router = APIRouter(prefix="/auth", tags=["auth"])

MAGIC_CODE_EXPIRY_MINUTES = MAGIC_CODE_EXPIRY_SECONDS // 60


def _require_direct_freeframe_mode() -> None:
    """Keep device login outside the Plane-scoped authentication boundary."""
    if settings.media_plane_mode:
        raise HTTPException(status_code=404, detail="Direct device login is unavailable in Plane mode")


def _generate_invite_token() -> str:
    """Generate a secure invite token."""
    return secrets.token_urlsafe(48)


@router.post("/send-magic-code", response_model=SendMagicCodeResponse, dependencies=[Depends(rate_limit("send_magic_code", 5, 600))])
def send_magic_code(body: SendMagicCodeRequest, db: Session = Depends(get_db)):
    """
    Send magic code to email.
    - If user exists: send code for login
    - If user doesn't exist: create pending user and send code
    """
    user = get_user_by_email(db, body.email)
    
    if not user:
        # Check if this is the first user (becomes super admin)
        user_count = db.query(User).filter(User.deleted_at.is_(None)).count()
        is_first_user = user_count == 0
        
        # Create new user in pending_verification status
        user = User(
            email=body.email,
            name=body.email.split("@")[0],  # Temporary name from email
            status=UserStatus.pending_verification,
            email_verified=False,
            is_superadmin=is_first_user,  # First user becomes super admin
        )
        db.add(user)
        db.commit()
    
    # Generate and store magic code in Redis
    code = generate_magic_code()
    store_magic_code(body.email, code)

    # Queue email via Celery (async)
    try:
        send_task_safe(send_magic_code_email, body.email, code, MAGIC_CODE_EXPIRY_MINUTES)
    except Exception:
        pass  # Email delivery is best-effort; code is already in Redis
    
    return SendMagicCodeResponse(
        message="Magic code sent to your email",
        email=body.email,
    )


@router.post("/verify-magic-code", response_model=TokenResponse, dependencies=[Depends(rate_limit("verify_magic_code", 10, 600))])
def verify_magic_code(body: VerifyMagicCodeRequest, db: Session = Depends(get_db)):
    """
    Verify magic code and return tokens.
    Returns needs_password=True if user hasn't set a password yet.
    """
    user = get_user_by_email(db, body.email)
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.status == UserStatus.deactivated:
        raise HTTPException(status_code=401, detail="Account deactivated")
    
    # Verify magic code from Redis
    success, error = redis_verify_magic_code(body.email, body.code)
    if not success:
        raise HTTPException(status_code=401, detail=error)
    
    # Mark email as verified
    user.email_verified = True
    
    # If user was pending verification, activate them
    if user.status == UserStatus.pending_verification:
        user.status = UserStatus.active
    
    db.commit()
    
    # Check if user needs to set password
    needs_password = user.password_hash is None
    
    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
        needs_password=needs_password,
    )


@router.post("/set-password", response_model=UserResponse)
def set_password(
    body: SetPasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Set password for authenticated user (after magic code verification)."""
    current_user.password_hash = hash_password(body.password)
    db.commit()
    db.refresh(current_user)
    return current_user


@router.get("/invite/{token}", response_model=InviteInfoResponse)
def get_invite_info(token: str, db: Session = Depends(get_db)):
    """Get info about an invite token (for the set-password screen)."""
    user = db.query(User).filter(
        User.invite_token == token,
        User.deleted_at.is_(None),
    ).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="Invalid invite link")
    
    if user.invite_token_expires_at and user.invite_token_expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Invite link expired")
    
    return InviteInfoResponse(
        email=user.email,
        name=user.name,
    )


@router.post("/accept-invite", response_model=TokenResponse)
def accept_invite(body: AcceptInviteRequest, db: Session = Depends(get_db)):
    """Accept invite and set password. Email is already verified via invite."""
    user = db.query(User).filter(
        User.invite_token == body.token,
        User.deleted_at.is_(None),
    ).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="Invalid invite link")
    
    if user.invite_token_expires_at and user.invite_token_expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Invite link expired")
    
    # Set password and activate user
    user.password_hash = hash_password(body.password)
    user.email_verified = True  # Invited users are pre-verified
    user.status = UserStatus.active
    user.invite_token = None
    user.invite_token_expires_at = None
    db.commit()
    
    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
        needs_password=False,
    )


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    """Register with email + password (legacy, prefer magic code flow)."""
    if get_user_by_email(db, body.email):
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=body.email,
        name=body.name,
        password_hash=hash_password(body.password),
        status=UserStatus.active,
        email_verified=False,  # Not verified until magic code
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    """Login with email + password."""
    user = get_user_by_email(db, body.email)
    if (
        not user
        or not user.password_hash
        or not verify_password(body.password, user.password_hash)
        or user.status == UserStatus.deactivated
    ):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
        needs_password=False,
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh_token(body: RefreshRequest, db: Session = Depends(get_db)):
    payload = decode_token(body.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    user = get_user_by_id(db, uuid.UUID(payload["sub"]))
    if not user or user.status == UserStatus.deactivated:
        raise HTTPException(status_code=401, detail="User not found")
    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
        needs_password=user.password_hash is None,
    )


@router.post("/device/start", response_model=DeviceStartResponse, dependencies=[Depends(rate_limit("device_start", 10, 600))])
def start_device_authorization(body: DeviceStartRequest):
    """Start the Direct FreeFrame browser/device flow for Premiere UXP only."""
    _require_direct_freeframe_mode()
    try:
        device_code, user_code = create_device_authorization(body.client_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Unsupported client_id")
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Device authorization is temporarily unavailable")
    verification_uri = f"{settings.frontend_url.rstrip('/')}/device"
    return DeviceStartResponse(
        device_code=device_code,
        user_code=user_code,
        verification_uri=verification_uri,
        verification_uri_complete=f"{verification_uri}?user_code={user_code}",
        expires_in=DEVICE_FLOW_EXPIRY_SECONDS,
        interval=DEVICE_POLL_INTERVAL_SECONDS,
    )


@router.post("/device/poll", dependencies=[Depends(rate_limit("device_poll", 120, 600))])
def poll_device_authorization_endpoint(body: DevicePollRequest, db: Session = Depends(get_db)):
    """Poll a Direct FreeFrame device request; an approved request is one-use."""
    _require_direct_freeframe_mode()
    result, user_id = poll_device_authorization(body.client_id, body.device_code)
    if result == "pending":
        return JSONResponse(status_code=202, content={"error": "authorization_pending"})
    if result == "slow_down":
        return JSONResponse(status_code=400, content={"error": "slow_down"})
    if result != "approved" or not user_id:
        return JSONResponse(status_code=400, content={"error": "invalid_device_code"})

    try:
        user = get_user_by_id(db, uuid.UUID(user_id))
    except (TypeError, ValueError):
        user = None
    if not user or user.status == UserStatus.deactivated:
        return JSONResponse(status_code=400, content={"error": "invalid_device_code"})
    return DeviceTokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/device/approve", dependencies=[Depends(rate_limit("device_approve", 20, 600))])
def approve_device_authorization_endpoint(
    body: DeviceApproveRequest,
    current_user: User = Depends(get_current_user),
):
    """Approve a browser-visible request for the current active FreeFrame user."""
    _require_direct_freeframe_mode()
    if not approve_device_authorization(body.user_code, str(current_user.id)):
        raise HTTPException(status_code=400, detail="Invalid or expired device code")
    return {"status": "approved"}


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me/preferences", response_model=UserResponse)
def update_preferences(
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update user preferences (theme, etc). Merges with existing preferences."""
    current_prefs = current_user.preferences or {}
    current_prefs.update(body)
    current_user.preferences = current_prefs
    # Force SQLAlchemy to detect the JSON change
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(current_user, "preferences")
    db.commit()
    db.refresh(current_user)
    return current_user
