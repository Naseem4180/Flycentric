const jwt = require('jsonwebtoken');

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, institution_id: user.institution_id },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_TTL || '15m' }
  );
}

function signRefreshToken(user) {
  return jwt.sign({ sub: user.id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: `${process.env.REFRESH_TOKEN_TTL_DAYS || 30}d`,
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}

module.exports = { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken };
