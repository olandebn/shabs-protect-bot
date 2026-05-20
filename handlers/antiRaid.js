// ============================================================
//  SHABS PROTECT BOT — Module Anti-Raid
//  Détecte les raids (joins massifs) et verrouille le serveur
// ============================================================

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config.json');

const recentJoins = new Map();
const lockdownState = new Map();

async function handleNewMember(member, sendLog) {
  const { guild } = member;
  const cfg = config.antiRaid;
  if (!cfg.enabled) return;
  const accountAgeMs = Date.now() - member.user.createdTimestamp;
  const accountAgeDays = accountAgeMs / (86400000);
  if (accountAgeDays < cfg.minAccountAgeDays) {
    try {
      if (cfg.newJoinAction === 'ban') { await member.ban({ reason: 'Anti-Raid : compte trop récent' }); }
      else { await member.kick('Anti-Raid : compte trop récent'); }
    } catch(err) { console.error('[Anti-Raid]', err); }
    return;
  }
  if (!recentJoins.has(guild.id)) recentJoins.set(guild.id, []);
  const joins = recentJoins.get(guild.id);
  const now = Date.now();
  const active = joins.filter(ts => now - ts < cfg.joinIntervalMs);
  active.push(now);
  recentJoins.set(guild.id, active);
  if (active.length >= cfg.joinThreshold && !lockdownState.get(guild.id)) {
    await activateLockdown(guild, sendLog, active.length);
  }
}

async function activateLockdown(guild, sendLog, joinCount) {
  const cfg = config.antiRaid;
  lockdownState.set(guild.id, true);
  await sendLog(new EmbedBuilder().setColor(0xFF0000).setTitle('🚨 RAID DÉTECTÉ — Lockdown activé').setDescription(`${joinCount} membres ont rejoint rapidement.`).setTimestamp());
  setTimeout(() => deactivateLockdown(guild, sendLog), cfg.lockdownDurationMs);
}

async function deactivateLockdown(guild, sendLog) {
  lockdownState.set(guild.id, false);
  await sendLog(new EmbedBuilder().setColor(0x00C851).setTitle('✅ Lockdown levé').setDescription('Serveur accessible.').setTimestamp());
}

function isLockdownActive(guildId) { return !!lockdownState.get(guildId); }

module.exports = { handleNewMember, activateLockdown, deactivateLockdown, isLockdownActive };
