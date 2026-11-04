"""Tests never spend money: the real key is blanked before the client reads .env, so nothing here can reach Meta."""

import os

os.environ["META_API_KEY"] = ""
os.environ["MODEL_API_KEY"] = ""
