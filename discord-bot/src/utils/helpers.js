const db = require('../database');
const cfg = require('./config');

async function resolveUser(guild, identifier) {
  if (!identifier) return null;
  identifier = identifier.trim();

  const mentionMatch = identifier.match(/^<@!?(\d+)>$/);
  if (mentionMatch) {
    try { return await guild.members.fetch(mentionMatch[1]); } catch { return null; }
  }

  if (/^\d{17,19}$/.test(identifier)) {
    try { return await guild.members.fetch(identifier); } catch { return null; }
  }

  try {
    await guild.members.fetch();
    return guild.members.cache.find(
      m => m.user.username.toLowerCase() === identifier.toLowerCase() ||
           m.displayName.toLowerCase() === identifier.toLowerCase()
    ) || null;
  } catch {
    return null;
  }
}

function hasRole(member, roleId) {
  if (!roleId) return false;
  return member.roles.cache.has(roleId);
}

function hasTier2(member) {
  if (member.permissions.has(8n)) return true;
  const guildId = member.guild.id;
  const roleId = cfg.getTier2RoleId(guildId);
  if (roleId && hasRole(member, roleId)) return true;
  const managerRoleId = cfg.getBotManagerRoleId(guildId);
  if (managerRoleId && hasRole(member, managerRoleId)) return true;
  return hasTier3(member);
}

function hasTier3(member) {
  if (member.permissions.has(8n)) return true;
  const guildId = member.guild.id;
  const roleId = cfg.getTier3RoleId(guildId);
  if (roleId && hasRole(member, roleId)) return true;
  const managerRoleId = cfg.getBotManagerRoleId(guildId);
  if (managerRoleId && hasRole(member, managerRoleId)) return true;
  return false;
}

function parseDate(str) {
  const match = str?.match(/^(\d{2})\/(\d{2})-(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, day, month, hour, min] = match;
  const year = new Date().getFullYear();
  const date = new Date(year, parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(min), 0);
  return Math.floor(date.getTime() / 1000);
}

function ensureUser(discordId, username) {
  let user = db.getUser(discordId);
  if (!user) {
    db.createUser(discordId, username);
    user = db.getUser(discordId);
  }
  return user;
}

module.exports = { resolveUser, hasTier2, hasTier3, parseDate, ensureUser };
