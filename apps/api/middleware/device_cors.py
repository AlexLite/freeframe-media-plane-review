"""Narrow non-credentialed CORS support for Adobe UXP device flow."""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


DEVICE_FLOW_PATHS = {"/auth/device/start", "/auth/device/poll"}
DEVICE_FLOW_ALLOW_ORIGIN = "*"


class DeviceFlowCORSMiddleware(BaseHTTPMiddleware):
    """Allow non-credentialed CORS on unauthenticated device endpoints only.

    Premiere UXP can send either an opaque ``null`` origin or a concrete
    ``uxp://...`` origin. These endpoints carry no cookies or other browser
    credentials, so wildcard CORS is safe here and avoids coupling the API to
    a particular UXP runtime origin. The application's credentialed CORS
    policy remains unchanged for every other route.
    """

    async def dispatch(self, request: Request, call_next):
        is_device_request = request.url.path in DEVICE_FLOW_PATHS

        if (
            is_device_request
            and request.method == "OPTIONS"
            and request.headers.get("access-control-request-method", "").upper() == "POST"
        ):
            return Response(
                status_code=204,
                headers={
                    "Access-Control-Allow-Origin": DEVICE_FLOW_ALLOW_ORIGIN,
                    "Access-Control-Allow-Methods": "POST, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type",
                    "Access-Control-Max-Age": "600",
                },
            )

        response = await call_next(request)
        if is_device_request and request.headers.get("origin"):
            response.headers["Access-Control-Allow-Origin"] = DEVICE_FLOW_ALLOW_ORIGIN
            response.headers.pop("Access-Control-Allow-Credentials", None)
        return response
