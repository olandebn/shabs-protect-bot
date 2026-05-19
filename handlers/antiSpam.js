// SHABS PROTECT BOT - Anti-Spam
const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const userMessageData = new Map();
const mutedUsers = new Map();
async function handleMessage(message, sendLog) {
  if (!config.antiSpam.enabled) return false;
  if (message.author.bot) return false;
  if (message.member?.permissions.has('ManageMessages')) return false;
  const cfg = config.antiSpam;
  const userId = message.author.id;
  const now = Date.now();
  if (!userMessageData.has(userId)) userMessageData.set(userId, { messages: [], warnings: 0, lastContent: '' });
  const userData = userMessageData.get(userId);
  userData.messages = userData.messages.filter(ts => now - ts < cfg.messageIntervalMs);
  userData.messages.push(now);
  if (userData.messages.length >= cfg.messageThreshold) {
    try { await message.delete(); } catch(_) {}
    await applyMute(message.member, cfg.muteDurationMs, sendLog, 'vitesse');
    userData.messages = [];
    return true;
  }
  const content = message.content.trim().toLowerCase();
  if (content && content === userData.lastContent) {
    userData.duplicateCount = (userData.duplicateCount || 0) + 1;
    if (userData.duplicateCount >= cfg.duplicateThreshold) {
      try { await message.delete(); } catch(_) {}
      await applyMute(message.member, cfg.muteDurationMs, sendLog, 'doublon');
      userData.duplicateCount = 0;
      return true;
    }
  } else { userData.duplicateCount = 0; }
  userData.lastContent = content;
  return false;
}
asnc function applyMute(member, durationMs, sendLog, reason) {
  try {
    await member.timeout(durationMs, `Anti-Spam: ${reason}`);
    await sendLog(new EmbedBuilder().setColor(0xFF6600).setTitle('🔇 Anti-Spam — Mute').addFields({name:'Utilisateur', value:`<@${member.id}>`,inline:true},{name:'Raison',value:reason,inline:true}).setTimestamp());
  } catch (err) { console.error('[Anti-Spam]', err); }
}
function resetUser(userId) { userMessageData.delete(userId); mutedUsers.delete(userId); }
module.exports = { handleMessage, applyMute, resetUser };
