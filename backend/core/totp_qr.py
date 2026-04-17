from __future__ import annotations

import io

import qrcode
import qrcode.image.svg


def build_totp_qr_svg(otpauth_uri: str) -> str:
    """Render ``otpauth://`` URI as a standalone SVG string (for HTML embedding).

    ``TOTPDevice.config_url`` returns an otpauth URI, not an image URL — browsers
    cannot load it in ``<img src>`` directly.
    """

    qr = qrcode.QRCode(version=1, box_size=6, border=2)
    qr.add_data(otpauth_uri)
    qr.make(fit=True)
    img = qr.make_image(image_factory=qrcode.image.svg.SvgImage)
    buf = io.BytesIO()
    img.save(buf)
    return buf.getvalue().decode("utf-8")
