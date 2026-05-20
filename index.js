// ============================================================
//  SHABS PROTECT BOT â€” TaniÃ¨res des SHABS
//  Bot de sÃ©curitÃ© complet pour serveur Discord
//  DÃ©veloppÃ© avec discord.js v14
// ============================================================

require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  PermissionFlagsBits,
  ActivityType
} = require('discord.js');

const antiRaid        = require('./handlers/antiRaid');
const antiSpam        = require('./handlers/antiSpam');
const verification    = require('./handlers/verification');
const autoMod         = require('./handlers/autoMod');

// ---- Validation de la configuration ----
if (!process.env.BOT_TOKEN) {
  console.error('âŒ BOT_TOKEN manquant dans le fichier .env !');
  process.exit(1);
}

const PREFIX = process.env.PREFIX || '!';

// ---- CrÃ©ation du client Discord ----
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
  ]
});

// ============================================================
//  FONCTION UTILITAIRE â€” Envoyer un log dans le salon dÃ©diÃ©
// ============================================================
async function sendLog(guild, embedOrContent) {
  const logChannelId = process.env.LOG_CHANNEL_ID;
  if (!logChannelId) return;

  const logChannel = guild.channels.cache.get(logChannelId);
  if (!logChannel) return;

  try {
    if (embedOrContent instanceof EmbedBuilder) {
      await logChannel.send({ embeds: [embedOrContent] });
    } else {
      await logChannel.send(embedOrContent);
    }
  } catch (err) {
    console.error('[Bot] Erreur envoi log:', err.message);
  }
}

// CrÃ©e une fonction sendLog liÃ©e Ã  une guild
function createLogger(guild) {
  return (embedOrContent) => sendLog(guild, embedOrContent);
}

// ============================================================
//  Ã‰VÃ‰NEMENT â€” Connexion du bot
// ============================================================
client.once('ready', () => {
  console.log(`âœ… Bot connectÃ© en tant que ${client.user.tag}`);
  console.log(`ðŸ“¡ ConnectÃ© Ã  ${client.guilds.cache.size} serveur(s)`);

  client.user.setActivity('TaniÃ¨res des SHABS ðŸ›¡ï¸', { type: ActivityType.Watching });
});

// ============================================================
//  Ã‰VÃ‰NEMENT â€” Nouveau membre
// ============================================================
client.on('guildMemberAdd', async (member) => {
  const log = createLogger(member.guild);

  // Anti-Raid : vÃ©rification Ã¢ge du compte + dÃ©tection raid
  await antiRaid.handleNewMember(member, log);

  // VÃ©rification : attribuer le rÃ´le "non-vÃ©rifiÃ©"
  if (process.env.UNVERIFIED_ROLE_ID) {
    await verification.assignUnverifiedRole(member);
  }
});

// ============================================================
//  Ã‰VÃ‰NEMENT â€” Message reÃ§u
// ============================================================
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return; // Ignorer les DMs

  const log = createLogger(message.guild);

  // ---- Traitement des commandes ----
  if (message.content.startsWith(PREFIX)) {
    await handleCommand(message, log);
    return;
  }

  // ---- Anti-Spam ----
  const spamDetected = await antiSpam.handleMessage(message, log);
  if (spamDetected) return;

  // ---- Auto-ModÃ©ration ----
  await autoMod.handleMessage(message, log);
});

// ============================================================
//  Ã‰VÃ‰NEMENT â€” RÃ©action ajoutÃ©e (vÃ©rification membres)
// ============================================================
client.on('messageReactionAdd', async (reaction, user) => {
  // Charger les donnÃ©es partielles si nÃ©cessaire
  if (reaction.partial) {
    try { await reaction.fetch(); } catch (_) { return; }
  }
  if (reaction.message.partial) {
    try { await reaction.message.fetch(); } catch (_) { return; }
  }

  const log = createLogger(reaction.message.guild);
  await verification.handleReactionAdd(reaction, user, log);
});

// ============================================================
//  COMMANDES DE MODÃ‰RATION
// ============================================================
async function handleCommand(message, log) {
  // VÃ©rifier que l'auteur est modÃ©rateur ou a les permissions nÃ©cessaires
  const isMod = message.member.permissions.has(PermissionFlagsBits.ManageMessages)
    || (process.env.MOD_ROLE_ID && message.member.roles.cache.has(process.env.MOD_ROLE_ID));

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();

  // Commandes publiques
  if (command === 'ping') {
    return message.reply(`ðŸ“ Pong ! Latence : **${client.ws.ping}ms**`);
  }

  if (command === 'help' || command === 'aide') {
    return message.reply({ embeds: [buildHelpEmbed()] });
  }

  // ---- !setup (admin uniquement) ----
  if (command === 'setup') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('âŒ Seul un **administrateur** peut lancer la configuration.');
    }
    return handleSetup(message);
  }

  // Commandes rÃ©servÃ©es aux modÃ©rateurs
  if (!isMod) {
    return message.reply('âŒ Tu n\'as pas la permission d\'utiliser cette commande.').then(
      m => setTimeout(() => m.delete().catch(() => {}), 5000)
    );
  }

  switch (command) {

    // ---- !ban @user [raison] ----
    case 'ban': {
      const target = message.mentions.members.first();
      if (!target) return message.reply('âŒ Mentionne un utilisateur. Ex: `!ban @user spam`');
      const reason = args.slice(1).join(' ') || 'Aucune raison fournie';
      try {
        await target.ban({ deleteMessageSeconds: 604800, reason: `${message.author.tag} : ${reason}` });
        await message.reply(`âœ… **${target.user.tag}** a Ã©tÃ© banni. Raison : ${reason}`);
        await log(new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('ðŸ”( Ban')
          .addFields(
            { name: 'Cible', value: `${target.user.tag} (${target.id})`, inline: true },
            { name: 'ModÃ©rateur', value: message.author.tag, inline: true },
            { name: 'Raison', value: reason }
          ).setTimestamp()
        );
      } catch (e) {
        message.reply('âŒ Impossible de bannir cet utilisateur.');
      }
      break;
    }

    // ---- !kick @user [raison] ----
    case 'kick': {
      const target = message.mentions.members.first();
      if (!target) return message.reply('âŒ Mentionne un utilisateur. Ex: `!kick @user comportement`');
      const reason = args.slice(1).join(' ') || 'Aucune raison fournie';
      try {
        await target.kick(`${message.author.tag} : ${reason}`);
        await message.reply(`âœ… **${target.user.tag}** a Ã©tÃ© expulsÃ©. Raison : ${reason}`);
        await log(new EmbedBuilder()
          .setColor(0xFF6600)
          .setTitle('ðŸ‘¢ Kick')
          .addFields(
            { name: 'Cible', value: `${target.user.tag} (${target.id})`, inline: true },
            { name: 'ModÃ©rateur', value: message.author.tag, inline: true },
            { name: 'Raison', value: reason }
          ).setTimestamp()
        );
      } catch (e) {
        message.reply('âŒ Impossible d\'expulser cet utilisateur.');
      }
      break;
    }

    // ---- !mute @user [durÃ©e en minutes] [raison] ----
    case 'mute': {
      const target = message.mentions.members.first();
      if (!target) return message.reply('âŒ Mentionne un utilisateur. Ex: `!mute @user 30 spam`');
      const duration = parseInt(args[1]) || 10; // minutes
      const reason = args.slice(2).join(' ') || 'Aucune raison fournie';
      try {
        await target.timeout(duration * 60 * 1000, `${message.author.tag} : ${reason}`);
        await message.reply(`âœ… **${target.user.tag}** est rÃ©duit au silence pour **${duration} minutes**.`);
        await log(new EmbedBuilder()
          .setColor(0xFFA500)
          .setTitle('ðŸ”‡ Mute')
          .addFields(
            { name: 'Cible', value: `${target.user.tag} (${target.id})`, inline: true },
            { name: 'DurÃ©e', value: `${duration} minutes`, inline: true },
            { name: 'ModÃ©rateur', value: message.author.tag, inline: true },
            { name: 'Raison', value: reason }
          ).setTimestamp()
        );
      } catch (e) {
        message.reply('âŒ Impossible de muter cet utilisateur.');
      }
      break;
    }

    // ---- !unmute @user ----
    case 'unmute': {
      const target = message.mentions.members.first();
      if (!target) return message.reply('âŒ Mentionne un utilisateur.');
      try {
        await target.timeout(null);
        await message.reply(`âœ… **${target.user.tag}** peut de nouveau parler.`);
      } catch (e) {
        message.reply('âŒ Impossible de dÃ©muter cet utilisateur.');
      }
      break;
    }

    // ---- !warn @user [raison] ----
    case 'warn': {
      const target = message.mentions.members.first();
      if (!target) return message.reply('âŒ Mentionne un utilisateur.');
      const reason = args.slice(1).join(' ') || 'Comportement inappropriÃ©';
      const count = autoMod.getWarnings(target.id) + 1;
      await log(new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle(`âš ï¸ Avertissement #${count}`)
        .addFields(
          { name: 'Cible', value: `${target.user.tag} (${target.id})`, inline: true },
          { name: 'ModÃ©rateur', value: message.author.tag, inline: true },
          { name: 'Raison', value: reason }
        ).setTimestamp()
      );
      try {
        await target.send(`âš ï¸ Tu as reÃ§u un avertissement sur **${message.guild.name}**.\nRaison : ${reason}`);
      } catch (_) {}
      await message.reply(`âœ… **${target.user.tag}** a reÃ§u un avertissement. Raison : ${reason}`);
      break;
    }

    // ---- !warnings @user ----
    case 'warnings': {
      const target = message.mentions.members.first();
      if (!target) return message.reply('âŒ Mentionne un utilisateur.');
      const count = autoMod.getWarnings(target.id);
      await message.reply(`ðŸ“‹ **${target.user.tag}** a **${count}** avertissement(s) auto-mod.`);
      break;
    }

    // ---- !clearwarns @user ----
    case 'clearwarns': {
      const target = message.mentions.members.first();
      if (!target) return message.reply('âŒ Mentionne un utilisateur.');
      autoMod.clearWarnings(target.id);
      await message.reply(`âœ… Les avertissements de **${target.user.tag}** ont Ã©tÃ© rÃ©initialisÃ©s.`);
      break;
    }

    // ---- !purge [nombre] ----
    case 'purge':
    case 'clear': {
      const amount = Math.min(parseInt(args[0]) || 10, 100);
      try {
        const deleted = await message.channel.bulkDelete(amount, true);
        await message.channel.send(`ðŸ—‘ï¸ **${deleted.size}** message(s) supprimÃ©(s).`)
          .then(m => setTimeout(() => m.delete().catch(() => {}), 4000));
        await log(new EmbedBuilder()
          .setColor(0x999999)
          .setTitle('ðŸ—‘ï¸ Purge')
          .addFields(
            { name: 'Salon', value: `<#${message.channel.id}>`, inline: true },
            { name: 'Messages supprimÃ©s', value: `${deleted.size}`, inline: true },
            { name: 'ModÃ©rateur', value: message.author.tag, inline: true }
          ).setTimestamp()
        );
      } catch (e) {
        message.reply('âŒ Impossible de supprimer ces messages (peut-Ãªtre trop anciens ?)');
      }
      break;
    }

    // ---- !lockdown on/off ----
    case 'lockdown': {
      const subCmd = args[0]?.toLowerCase();
      if (subCmd === 'off') {
        await antiRaid.deactivateLockdown(message.guild, log);
        await message.reply('âœ… Lockdown dÃ©sactivÃ© manuellement.');
      } else {
        await antiRaid.activateLockdown(message.guild, log, 0);
        await message.reply('ðŸ”’ Lockdown activÃ© manuellement.');
      }
      break;
    }

    // ---- !setup-verification ----
    case 'setup-verification': {
      if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.reply('âŒ Seul un administrateur peut configurer la vÃ©rification.');
      }
      await message.reply('â³ CrÃ©ation du message de vÃ©rification...');
      const msg = await verification.setupVerificationMessage(message.guild, client, log);
      if (msg) {
        await message.reply(`âœ… Message de vÃ©rification crÃ©Ã© dans <#${process.env.VERIFICATION_CHANNEL_ID}> !`);
      } else {
        await message.reply('âŒ Erreur : vÃ©rifie que `VERIFICATION_CHANNEL_ID` est bien dÃ©fini dans ton `.env`.');
      }
      break;
    }

    // ---- !status ----
    case 'status': {
      const cfg = require('./config.json');
      const embed = new EmbedBuilder()
        .setColor(0x7289DA)
        .setTitle('ðŸ“Š Statut du bot SHABS Protect')
        .addFields(
          { name: 'ðŸ›¡ï¸ Anti-Raid',       value: cfg.antiRaid.enabled     ? 'âœ… Actif' : 'âŒ Inactif', inline: true },
          { name: 'ðŸ”‡ Anti-Spam',       value: cfg.antiSpam.enabled     ? 'âœ… Actif' : 'âŒ Inactif', inline: true },
          { name: 'âœ… VÃ©rification',    value: cfg.verification.enabled  ? 'âœ… Active' : 'âŒ Inactive', inline: true },
          { name: 'ðŸ¤– Auto-Mod',        value: cfg.autoMod.enabled      ? 'âœ… Active' : 'âŒ Inactive', inline: true },
          { name: 'ðŸ“¡ Latence',         value: `${client.ws.ping}ms`, inline: true },
          { name: 'ðŸ‘¥ Membres',         value: `${message.guild.memberCount}`, inline: true }
        )
        .setFooter({ text: 'TaniÃ¨res des SHABS â€¢ SHABS Protect Bot' })
        .setTimestamp();
      await message.reply({ embeds: [embed] });
      break;
    }

    default:
      // Commande inconnue, ignorer silencieusement
      break;
  }
}

// ============================================================
//  COMMANDE SETUP â€” CrÃ©e tout automatiquement sur le serveur
// ============================================================
async function handleSetup(message) {
  const { guild } = message;
  const statusMsg = await message.reply('âš™ï¸ Configuration en cours... (cela peut prendre quelques secondes)');

  try {
    const results = [];

    // ---- 1. CrÃ©er le rÃ´le Non-vÃ©rifiÃ© ----
    let unverifiedRole = guild.roles.cache.find(r => r.name === 'ðŸ”’ Non-vÃ©rifiÃ©');
    if (!unverifiedRole) {
      unverifiedRole = await guild.roles.create({
        name: 'ðŸ”’ Non-vÃ©rifiÃ©',
        color: 0x808080,
        reason: 'Setup SHABS Protect Bot',
        position: 1
      });
      results.push('âœ… RÃ´le **ðŸ”’ Non-vÃ©rifiÃ©** crÃ©Ã©');
    } else {
      results.push('â­ï¸ RÃ´le **ðŸ”’ Non-vÃ©rifiÃ©** dÃ©jÃ  existant');
    }
    process.env.UNVERIFIED_ROLE_ID = unverifiedRole.id;

    // ---- 2. CrÃ©er le rÃ´le Membre ----
    let memberRole = guild.roles.cache.find(r => r.name === 'âœ… Membre');
    if (!memberRole) {
      memberRole = await guild.roles.create({
        name: 'âœ… Membre',
        color: 0x57F287,
        reason: 'Setup SHABS Protect Bot',
        position: 2
      });
      results.push('âœ… RÃ´le **âœ… Membre** crÃ©Ã©');
    } else {
      results.push('â­ï¸ RÃ´le **âœ… Membre** dÃ©jÃ  existant');
    }
    process.env.MEMBER_ROLE_ID = memberRole.id;

    // ---- 3. CrÃ©er le rÃ´le ModÃ©rateur ----
    let modRole = guild.roles.cache.find(r => r.name === 'ðŸ›¡ï¸ ModÃ©rateur');
    if (!modRole) {
      modRole = await guild.roles.create({
        name: 'ðŸ›¡ï¸ ModÃ©rateur',
        color: 0x3498DB,
        reason: 'Setup SHABS Protect Bot',
        permissions: [
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.KickMembers,
          PermissionFlagsBits.BanMembers,
          PermissionFlagsBits.ModerateMembers,
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageRoles
        ]
      });
      results.push('âœ… RÃ´le **ðŸ›¡ï¸ ModÃ©rateur** crÃ©Ã©');
    } else {
      results.push('â­ï¸ RÃ´le **ðŸ›¡ï¸ ModÃ©rateur** dÃ©jÃ  existant');
    }
    process.env.MOD_ROLE_ID = modRole.id;

    // ---- 4. CrÃ©er la catÃ©gorie SHABS PROTECT ----
    let category = guild.channels.cache.find(c => c.name === 'SHABS PROTECT' && c.type === 4);
    if (!category) {
      category = await guild.channels.create({
        name: 'SHABS PROTECT',
        type: 4, // CategoryChannel
        reason: 'Setup SHABS Protect Bot'
      });
    }

    // ---- 5. CrÃ©er le salon #logs-sÃ©curitÃ© ----
    let logChannel = guild.channels.cache.find(c => c.name === 'logs-sÃ©curitÃ©');
    if (!logChannel) {
      logChannel = await guild.channels.create({
        name: 'logs-sÃ©curitÃ©',
        type: 0, // TextChannel
        parent: category.id,
        reason: 'Setup SHABS Protect Bot',
        permissionOverwrites: [
          {
            id: guild.roles.everyone,
            deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
          },
          {
            id: modRole.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
          },
          {
            id: client.user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]
          }
        ]
      });
      results.push('âœ… Salon **#logs-sÃ©curitÃ©** crÃ©Ã©');
    } else {
      results.push('â­ï¸ Salon **#logs-sÃ©curitÃ©** dÃ©jÃ  existant');
    }
    process.env.LOG_CHANNEL_ID = logChannel.id;

    // ---- 6. CrÃ©er le salon #vÃ©rification ----
    let verifChannel = guild.channels.cache.find(c => c.name === 'vÃ©rification');
    if (!verifChannel) {
      verifChannel = await guild.channels.create({
        name: 'vÃ©rification',
        type: 0,
        parent: category.id,
        reason: 'Setup SHABS Protect Bot',
        permissionOverwrites: [
          {
            id: guild.roles.everyone,
            deny: [PermissionFlagsBits.SendMessages],
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]
          },
          {
            id: unverifiedRole.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]
          },
          {
            id: memberRole.id,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: client.user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions, PermissionFlagsBits.EmbedLinks]
          }
        ]
      });
      results.push('âœ… Salon **#vÃ©rification** crÃ©Ã©');
    } else {
      results.push('â­ï¸ Salon **#vÃ©rification** dÃ©jÃ  existant');
    }
    process.env.VERIFICATION_CHANNEL_ID = verifChannel.id;

    // ---- 7. Restreindre @everyone aux canaux des non-vÃ©rifiÃ©s ----
    // Donner aux membres vÃ©rifiÃ©s l'accÃ¨s Ã  tout le reste
    // (configuration minimale â€” l'admin peut affiner)

    // ---- 8. CrÃ©er le message de vÃ©rification ----
    const log = createLogger(guild);
    await verification.setupVerificationMessage(guild, client, log);
    results.push('âœ… Message de vÃ©rification envoyÃ© dans **#vÃ©rification**');

    // ---- RÃ©sumÃ© ----
    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('ðŸŽ‰ Configuration SHABS Protect terminÃ©e !')
      .setDescription(results.join('\n'))
      .addFields(
        { name: 'ðŸ“‹ RÃ©capitulatif des IDs', value:
          `Logs : <#${logChannel.id}>\n` +
          `VÃ©rification : <#${verifChannel.id}>\n` +
          `RÃ´le Membre : <@&${memberRole.id}>\n` +
          `RÃ´le ModÃ©rateur : <@&${modRole.id}>\n` +
          `RÃ´le Non-vÃ©rifiÃ© : <@&${unverifiedRole.id}>`
        },
        { name: 'ðŸ“Œ Prochaines Ã©tapes', value:
          '1. Attribue le rÃ´le **ðŸ›¡ï¸ ModÃ©rateur** Ã  tes mods\n' +
          '2. Attribue le rÃ´le **ðŸ”’ Non-vÃ©rifiÃ©** aux nouveaux membres\n' +
          '3. VÃ©rifie les permissions de tes salons existants\n' +
          '4. Tape `!aide` pour voir toutes les commandes'
        }
      )
      .setFooter({ text: 'TaniÃ¨res des SHABS â€¢ SHABS Protect Bot' })
      .setTimestamp();

    await statusMsg.edit({ content: '', embeds: [embed] });

    // Log dans le canal de logs
    const logFn = createLogger(guild);
    await logFn(new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('âš™ï¸ Setup complÃ©tÃ©')
      .setDescription(`Configuration effectuÃ©e par **${message.author.tag}**`)
      .setTimestamp()
    );

  } catch (err) {
    console.error('[Setup] Erreur:', err);
    await statusMsg.edit(`âŒ Erreur lors de la configuration : \`${err.message}\`\nAssure-toi que le bot a la permission **Administrateur** sur le serveur.`);
  }
}

// ============================================================
//  EMBED D'AIDE
// ============================================================
function buildHelpEmbed() {
  return new EmbedBuilder()
    .setColor(0x7289DA)
    .setTitle('ðŸ“– SHABS Protect Bot â€” Commandes')
    .setDescription(`PrÃ©fixe : \`${PREFIX}\``)
    .addFields(
      {
        name: 'ðŸŒ Commandes publiques',
        value: [
          `\`${PREFIX}ping\` â€” Latence du bot`,
          `\`${PREFIX}aide\` â€” Ce menu d'aide`,
        ].join('\n')
      },
      {
        name: 'ðŸ›¡ï¸ ModÃ©ration (modÃ©rateurs)',
        value: [
          `\`${PREFIX}ban @user [raison]\` â€” Bannir`,
          `\`${PREFIX}kick @user [raison]\` â€” Expulser`,
          `\`${PREFIX}mute @user [minutes] [raison]\` â€” RÃ©duire au silence`,
          `\`${PREFIX}unmute @user\` â€” Lever le silence`,
          `\`${PREFIX}warn @user [raison]\` â€” Avertir`,
          `\`${PREFIX}warnings @user\` â€” Voir les avertissements`,
          `\`${PREFIX}clearwarns @user\` â€” Effacer les avertissements`,
          `\`${PREFIX}purge [nombre]\` â€” Supprimer des messages (max 100)`,
          `\`${PREFIX}lockdown on/off\` â€” Verrouiller/dÃ©verrouiller le serveur`,
        ].join('\n')
      },
      {
        name: 'âš™ï¸ Administration',
        value: [
          `\`${PREFIX}setup-verification\` â€” CrÃ©er le message de vÃ©rification`,
          `\`${PREFIX}status\` â€” Statut des modules de protection`,
        ].join('\n')
      }
    )
    .setFooter({ text: 'TaniÃ¨res des SHABS â€¢ SHABS Protect Bot' })
    .setTimestamp();
}

// ============================================================
//  GESTION DES ERREURS
// ============================================================
client.on('error', err => console.error('[Client Error]', err));
process.on('unhandledRejection', err => console.error('[Unhandled Rejection]', err));

// ============================================================
//  CONNEXION DU BOT
// ============================================================
client.login(process.env.BOT_TOKEN);
