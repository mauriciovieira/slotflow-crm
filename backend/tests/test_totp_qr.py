from __future__ import annotations

from core.totp_qr import build_totp_qr_svg


def test_build_totp_qr_svg_returns_svg() -> None:
    uri = "otpauth://totp/Issuer:alice?secret=JBSWY3DPEHPK3PXP&issuer=Issuer"
    svg = build_totp_qr_svg(uri)
    assert not svg.startswith("<?xml")
    assert "<svg" in svg
    assert "http://www.w3.org/2000/svg" in svg
    assert "<path" in svg
    assert "svg:rect" not in svg
