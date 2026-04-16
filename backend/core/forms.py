from __future__ import annotations

from django import forms


class TokenForm(forms.Form):
    token = forms.CharField(min_length=6, max_length=16)
