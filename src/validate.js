// Small, dependency-free input validators.
const NAME_RE = /^[A-Za-z0-9_-]+$/;

function validateUsername(value) {
  const name = String(value ?? '').trim();
  if (name.length < 2 || name.length > 30 || !/^[A-Za-z0-9_. -]+$/.test(name)) {
    return { ok: false, error: 'username must be 2-30 characters: letters, numbers, space, dot, dash, underscore' };
  }
  return { ok: true, value: name };
}

function validateRoom(value) {
  const room = String(value ?? '').trim();
  if (!room || room.length > 50 || !NAME_RE.test(room)) {
    return { ok: false, error: 'room must be 1-50 characters: letters, numbers, dash, underscore' };
  }
  return { ok: true, value: room };
}

function validateText(value) {
  const text = String(value ?? '').trim();
  if (!text || text.length > 1000) {
    return { ok: false, error: 'message text is required and must be at most 1000 characters' };
  }
  return { ok: true, value: text };
}

module.exports = { validateUsername, validateRoom, validateText };
