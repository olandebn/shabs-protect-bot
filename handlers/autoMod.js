// ============================================================
//  SHABS PROTECT BOT — Module Auto-Modération
//  Filtre : mots interdits, liens, mentions, majuscules, invites
// ============================================================

const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');

const userWarnings = new Map();

async function handleMessage(message, sendLog) {
  const cfg = config.autoMod;
  if (!cfg.enabled) return false;
  if (message.author.bot) return false;
  if (message.member?.permissions.has('ManageMessages')) return false;
  const checks = [
    cfg.badWords.enabled ? checkBadWords(message, sendLog) : Promise.resolve(false),
    cfg.inviteLinks.enabled ? checkInviteLinks(message, sendLog) : Promise.resolve(false),
    cfg.linkFilter.enabled ? checkLinks(message, sendLog) : Promise.resolve(false),
    cfg.mentionSpam.enabled ? checkMentions(message, sendLog) : Promise.resolve(false),
    cfg.capsSpam.enabled ? checkCaps(message, sendLog) : Promise.resolve(false),
  ];
  const results = await Promise.all(checks);
  return results.some(Boolean);
}

async function checkBadWords(message, sendLog) {
  const cfg = config.autoMod.badWords;
  const content = message.content.toLowerCase();
  const foundWord = cfg.words.find(w => new RegExp(`\\b${escapeRegex(w.toLowerCase())}\\b`).test(content));
  if (!foundWord) return false;
  try { await message.delete(); } catch(_) {}
  await warnUser(message, `Mot interdit: \`${foundWord}\``, sendLog);
  return true;
}
asnc function checkInviteLinks(message, sendLog) {
  if (!/discord(?:\.gg|\.com\/invite|app\.com\/invite)\/[a-zA-Z0-9]+/i.test(message.content)) return false;
  try { await message.delete(); } catch(_) {}
  await warnUser(message, 'Lien invitation externe', sendLog);
  return true;
}
async function checkLinks(message, sendLog) {
  const cfg = config.autoMod.linkFilter;
  const urls = message.content.match(/https?:\/\/[^\s]+/gi);
  if (!urls) return false;
  const forbidden = urls.filter(u => !cfg.allowedDomains.some(d => u.toLowerCase().includes(d)));
  if (!forbidden.length) return false;
  try { await message.delete(); } catch(_) {}
  await warnUser(message, `Lien non autorisé: ${forbidden[0]}`, sendLog);
  return true;
}
async function checkMentions(message, sendLog) {
  const cfg = config.autoMod.mentionSpam;
  const count = message.mentions.users.size + message.mentions.roles.size;
  if (count < cfg.maxMentionsPerMessage) return false;
  try { await message.delete(); } catch(_) {}
  await warnUser(message, `Trop de mentions: ${count}/${cfg.maxMentionsPerMessage}`, sendLog);
  return true;
}
async function checkCaps(message, sendLog) {
  const cfg = config.autoMod.capsSpam;
  const content = message.content.replace(/[^a-zA-ZÀ-ÿ]/g, '');
  if (content.length < cfg.minMessageLength) return false;
  const uc = content.split('').filter(c => c === c.toUpperCase() && c !== c.toLowerCase()).length;
  if ((uc / content.length * 100) < cfg.maxCapsPercent) return false;
  try { await message.delete(); } catch(_) {}
  await warnUser(message, 'CAPS LOCK excessif', sendLog);
  return true;
}
async function warnUser(message, reason, sendLog) {
  const userId = message.author.id;
  const w = (userWarnings.get(userId) || 0) + 1;
  userWarnings.set(userId, w);
  await sendLog(new EmbedBuilder().setColor(w >= 3 ? 0xFF4500 : 0xFFA500).setTitle(`⚠️ Auto-Mod — Avertissement #${w}`).addFields({name:'Utilisateur',value:`<@${userId}>`,inline:true},{name:'Raison',value:reason,inline:true}).setTimestamp());
  if (w >= 3) {
    try { await message.member?.timeout(600000, `Auto-Mod: 3 avertissements`); userWarnings.set(userId, 0); }
    catch(err) { console.error(err); }
  }
  return w;
}
function getWarnings(userId) { return userWarnings.get(userId) || 0; }
function clearWarnings(userId) { userWarnings.delete(userId); }
function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]]\\/g, '\\$&'); }
module.exports = { handleMessage, getWarnings, clearWarnings };
