"""Narrow CORS support for Adobe UXP's ``Origin: null`` device flow."""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


DEVICE_FLOW_PATHS = {"/auth/device/start", "/auth/device/poll"}
UXP_NULL_ORIGIN = "null"


class DeviceFlowCORSMiddleware(BaseHTTPMiddleware):
    """Allow only UXP's opaque origin on unauthenticated device endpoints.

    UXP webviews send ``Origin: null``. It is not safe to add that origin to
    the application's global CORS policy, so this middleware handles only the
    two endpoints the extension calls before browser approval.
    """

    async def dispatch(self, request: Request, call_next):
        is_uxp_device_request = (
            request.url.path in DEVICE_FLOW_PATHS
            and request.headers.get("origin") == UXP_NULL_ORIGIN
        )

        if (
            is_uxp_device_request
            and request.method == "OPTIONS"
            and request.headers.get("access-control-request-method", "").upper() == "POST"
        ):
            return Response(
                status_code=204,
                headers={
                    "Access-Control-Allow-Origin": UXP_NULL_ORIGIN,
                    "Access-Control-Allow-Methods": "POST",
                    "Access-Control-Allow-Headers": "Content-Type",
                    "Access-Control-Max-Age": "600",
                    "Vary": "Origin",
                },
            )

        response = await call_next(request)
        if is_uxp_device_request:
            response.headers["Access-Control-Allow-Origin"] = UXP_NULL_ORIGIN
            response.headers["Vary"] = "Origin"
        return response
