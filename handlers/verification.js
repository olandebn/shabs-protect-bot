// SHABS PROTECT BOT - Verification
const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');
let verificationMessageId = null;
async function setupVerificationMessage(guild, client, sendLog) {
  const cfg = config.verification;
  const channelId = process.env.VERIFICATION_CHANNEL_ID;
  if (!channelId) return null;
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return null;
  try { const msgs = await channel.messages.fetch({ limit: 10 }); for (const [, m] of msgs.filter(m => m.author.id === client.user.id)) await m.delete().catch(()=>{}); } catch(_) {}
  const embed = new EmbedBuilder().setColor(0x7289DA).setTitle('🔐 Vérification requise').setDescription(cfg.welcomeMessage).setFooter({text:'Tanières des SHABS • Système de vérification'}).setTimestamp();
  const msg = await channel.send({ embeds: [embed] });
  await msg.react(cfg.reactionEmoji);
  verificationMessageId = msg.id;
  await sendLog(new EmbedBuilder().setColor(0x00C851).setTitle('✅ Message de vérification créé').addFields({name:'Salon',value:`<#${channelId}>`,inline:true}).setTimestamp());
  return msg;
}
async function handleReactionAdd(reaction, user, sendLog) {
  const cfg = config.verification;
  if (!cfg.enabled) return;
  if (user.bot) return;
  if (reaction.message.id !== verificationMessageId) return;
  if (reaction.emoji.name !== cfg.reactionEmoji && reaction.emoji.toString() !== cfg.reactionEmoji) return;
  const member = await reaction.message.guild.members.fetch(user.id).catch(()=>null);
  if (!member) return;
  const memberRoleId = process.env.MEMBER_ROLE_ID;
  if (!memberRoleId) return;
  try {
    await member.roles.add(memberRoleId, 'Vérification par réaction');
    const unverified = process.env.UNVERIFIED_ROLE_ID;
    if (unverified && member.roles.cache.has(unverified)) await member.roles.remove(unverified);
    if (cfg.sendWelcomeDm) await user.send(cfg.welcomeDmMessage).catch(()=>{});
    await sendLog(new EmbedBuilder().setColor(0x00C851).setTitle('✅ Membre vérifié').addFields({name:'Utilisateur',value:`<@${user.id}>`,inline:true}).setTimestamp());
  } catch (err) { console.error(err); }
}
async function assignUnverifiedRole(member) {
  const id = process.env.UNVERIFIED_ROLE_ID;
  if (!id) return;
  try { await member.roles.add(id); } catch(err) { console.error(err); }
}
function setVerificationMessageId(id) { verificationMessageId = id; }
function getVerificationMessageId() { return verificationMessageId; }
module.exports = { setupVerificationMessage, handleReactionAdd, assignUnverifiedRole, setVerificationMessageId, getVerificationMessageId };
