from __future__ import annotations

import io
import re

import qrcode
import qrcode.image.svg

_XML_DECL_RE = re.compile(r"^<\?xml[^?]*\?>\s*")


def build_totp_qr_svg(otpauth_uri: str) -> str:
    """Render ``otpauth://`` URI as an SVG snippet for HTML embedding (``|safe``).

    ``TOTPDevice.config_url`` returns an otpauth URI, not an image URL — browsers
    cannot load it in ``<img src>`` directly.

    Uses :class:`qrcode.image.svg.SvgPathImage` so the markup is plain ``<svg><path>``
    (the default :class:`qrcode.image.svg.SvgImage` emits prefixed ``svg:`` tags that
    do not render when injected into HTML5 documents).
    """

    qr = qrcode.QRCode(version=1, box_size=6, border=2)
    qr.add_data(otpauth_uri)
    qr.make(fit=True)
    img = qr.make_image(image_factory=qrcode.image.svg.SvgPathImage)
    buf = io.BytesIO()
    img.save(buf)
    raw = buf.getvalue().decode("utf-8")
    # Drop XML declaration so the fragment parses inside ``<div>`` / ``<main>``.
    return _XML_DECL_RE.sub("", raw, count=1)
