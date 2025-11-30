from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
import datetime
from flask_login import UserMixin

db = SQLAlchemy()


class UserGroup(db.Model):
    __tablename__ = 'user_group'
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), primary_key=True)
    group_id = db.Column(db.Integer, db.ForeignKey('group.id'), primary_key=True)
    role = db.Column(db.String(32), nullable=False, default='member')

    user = db.relationship('User', back_populates='user_groups')
    group = db.relationship('Group', back_populates='user_groups')


class User(UserMixin, db.Model):
    __tablename__ = 'user'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(150), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    # Explicit user email field (previously `email` was an alias of username)
    email = db.Column(db.String(150), unique=False, nullable=True)
    # Firebase UID if user is managed by Firebase
    firebase_uid = db.Column(db.String(128), unique=False, nullable=True)
    # optional timestamps
    created_at = db.Column(db.DateTime(), nullable=False, default=datetime.datetime.utcnow)
    last_login = db.Column(db.DateTime(), nullable=True)
    active = db.Column(db.Boolean, default=True, nullable=False)
    # Admin flag for global admin privileges (separate from group-level admin role)
    is_admin = db.Column(db.Boolean, default=False, nullable=False)
    # Email verification
    email_verified = db.Column(db.Boolean, default=False, nullable=False)
    email_verified_at = db.Column(db.DateTime(), nullable=True)

    # Session / presence tracking (for single-session lock and admin stats)
    current_session_id = db.Column(db.String(128), nullable=True)
    session_started_at = db.Column(db.DateTime(), nullable=True)
    last_active_at = db.Column(db.DateTime(), nullable=True)
    # accumulated active time in seconds (sum of finished sessions)
    total_active_seconds = db.Column(db.Integer, nullable=False, default=0)

    user_groups = db.relationship('UserGroup', back_populates='user', cascade='all, delete-orphan')

    # Compatibility properties for legacy code that expects `email` and `pw_hash`
    # `email` column now exists. Keep alias for `username` compatibility only
    @property
    def username_email(self) -> str:
        """Legacy alias returning the username (not used for actual email storage)."""
        return self.username

    @property
    def pw_hash(self) -> str:
        return self.password_hash

    @pw_hash.setter
    def pw_hash(self, value: str) -> None:
        # store raw value; if it's a Firebase UID we keep it here
        self.password_hash = value

    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

    @property
    def groups(self):
        return [ug.group for ug in self.user_groups]

    def add_to_group(self, group, role='member'):
        # replace existing role if present
        for ug in self.user_groups:
            if ug.group_id == group.id:
                ug.role = role
                return
        ug = UserGroup(user=self, group=group, role=role)
        self.user_groups.append(ug)

    def role_for_group(self, group):
        for ug in self.user_groups:
            if ug.group_id == group.id:
                return ug.role
        return None

    # --- Session helpers ---
    def is_online(self, timeout_seconds: int = 300) -> bool:
        """Return True if the user's last_active_at is recent (within timeout)."""
        try:
            if not self.last_active_at:
                return False
            now = datetime.datetime.utcnow()
            delta = now - self.last_active_at
            return delta.total_seconds() <= int(timeout_seconds)
        except Exception:
            return False

    def start_session(self, session_id: str) -> None:
        """Claim a session for this user. Overwrites any stale session info."""
        now = datetime.datetime.utcnow()
        self.current_session_id = session_id
        self.session_started_at = now
        self.last_active_at = now

    def heartbeat(self, session_id: str) -> bool:
        """Update last_active_at if session_id matches current_session_id. Returns True if updated."""
        try:
            if not session_id or self.current_session_id != session_id:
                return False
            self.last_active_at = datetime.datetime.utcnow()
            return True
        except Exception:
            return False

    def end_session(self, session_id: str) -> int:
        """End the session if session_id matches. Returns duration seconds added (0 if none)."""
        try:
            if not session_id or self.current_session_id != session_id:
                return 0
            now = datetime.datetime.utcnow()
            started = self.session_started_at or now
            duration = int((now - started).total_seconds())
            try:
                self.total_active_seconds = int((self.total_active_seconds or 0)) + int(duration)
            except Exception:
                self.total_active_seconds = int(duration)
            # clear session claim
            self.current_session_id = None
            self.session_started_at = None
            self.last_active_at = None
            return duration
        except Exception:
            return 0


class Group(db.Model):
    __tablename__ = 'group'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), unique=True, nullable=False)
    # filesystem-relative folder under data/ this group can access
    data_folder = db.Column(db.String(255), nullable=False, default='')

    user_groups = db.relationship('UserGroup', back_populates='group', cascade='all, delete-orphan')

    def users(self):
        return [ug.user for ug in self.user_groups]

    def admins(self):
        return [ug.user for ug in self.user_groups if ug.role == 'admin']

    def __repr__(self):
        return f"<Group {self.name} -> {self.data_folder}>"


class VerificationToken(db.Model):
    __tablename__ = 'verification_token'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    token = db.Column(db.String(256), unique=True, nullable=False)
    token_type = db.Column(db.String(32), nullable=False)  # 'email_verify', 'password_reset', etc.
    created_at = db.Column(db.DateTime(), nullable=False, default=datetime.datetime.utcnow)
    expires_at = db.Column(db.DateTime(), nullable=False)
    used = db.Column(db.Boolean, default=False, nullable=False)

    user = db.relationship('User')

    def is_valid(self) -> bool:
        """Check if token is still valid (not expired and not used)"""
        if self.used:
            return False
        if datetime.datetime.utcnow() > self.expires_at:
            return False
        return True
