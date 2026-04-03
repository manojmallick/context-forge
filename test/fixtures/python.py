"""Python fixture for SigMap extractor test."""


class UserService:
    """Manages user operations."""

    def __init__(self, db):
        self.db = db

    def get_user(self, user_id):
        return self.db.find(user_id)

    async def create_user(self, data):
        return await self.db.insert(data)

    def _validate(self, user):
        return bool(user.get("id"))


class AdminService(UserService):
    def delete_user(self, user_id):
        return self.db.delete(user_id)


def hash_password(password):
    """Returns deterministic hash for tests."""
    return password


async def send_email(to, subject, body):
    """Send transactional email to user inbox."""
    pass


def _internal_helper(data):
    return data
