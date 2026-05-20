// ============================================================
//  SHABS PROTECT BOT — Tanières des SHABS
//  Bot de sécurité complet pour serveur Discord
//  Développé avec discord.js v14
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
  console.error('❌ BOT_TOKEN manquant dans le fichier .env !');
  process.exit(1);
}

const PREFIX = process.env.PREFIX || '!';

// ---- Création du client Discord ----
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
//  FONCTION UTILITAIRE — Envoyer un log dans le salon dédié
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

// Crée une fonction sendLog liée à une guild
function createLogger(guild) {
  return (embedOrContent) => sendLog(guild, embedOrContent);
}

// ============================================================
//  ÉVÉNEMENT — Connexion du bot
// ============================================================
client.once('ready', () => {
  console.log(`✅ Bot connecté en tant que ${client.user.tag}`);
  console.log(`📡 Connecté à ${client.guilds.cache.size} serveur(s)`);

  client.user.setActivity('Tanières des SHABS 🛡️', { type: ActivityType.Watching });
});

// ============================================================
//  ÉVÉNEMENT — Nouveau membre
// ============================================================
client.on('guildMemberAdd', async (member) => {
  const log = createLogger(member.guild);

  // Anti-Raid : vérification âge du compte + détection raid
  await antiRaid.handleNewMember(member, log);

  // Vérification : attribuer le rôle "non-vérifié"
  if (process.env.UNVERIFIED_ROLE_ID) {
    await verification.assignUnverifiedRole(member);
  }
});

// ============================================================
//  ÉVÉNEMENT — Message reçu
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

  // ---- Auto-Modération ----
  await autoMod.handleMessage(message, log);
});

// ============================================================
//  ÉVÉNEMENT — Réaction ajoutée (vérification membres)
// ============================================================
client.on('messageReactionAdd', async (reaction, user) => {
  // Charger les données partielles si nécessaire
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
//  COMMANDES DE MODÉRATION
// ============================================================
async function handleCommand(message, log) {
  // Vérifier que l'auteur est modérateur ou a les permissions nécessaires
  const isMod = message.member.permissions.has(PermissionFlagsBits.ManageMessages)
    || (process.env.MOD_ROLE_ID && message.member.roles.cache.has(process.env.MOD_ROLE_ID));

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();

  // Commandes publiques
  if (command === 'ping') {
    return message.reply(`🏓 Pong ! Latence : **${client.ws.ping}ms**`);
  }

  if (command === 'help' || command === 'aide') {
    return message.reply({ embeds: [buildHelpEmbed()] });
  }

  // ---- !setup (admin uniquement) ----
  if (command === 'setup') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ Seul un **administrateur** peut lancer la configuration.');
    }
    return handleSetup(message);
  }

  // Commandes réservées aux modérateurs
  if (!isMod) {
    return message.reply('❌ Tu n\'as pas la permission d\'utiliser cette commande.').then(
      m => setTimeout(() => m.delete().catch(() => {}), 5000)
    );
  }

  switch (command) {

    // ---- !ban @user [raison] ----
    case 'ban': {
      const target = message.mentions.members.first();
      if (!target) return message.reply('❌ Mentionne un utilisateur. Ex: `!ban @user spam`');
      const reason = args.slice(1).join(' ') || 'Aucune raison fournie';
      try {
        await target.ban({ deleteMessageSeconds: 604800, reason: `${message.author.tag} : ${reason}` });
        await message.reply(`✅ **${target.user.tag}** a été banni. Raison : ${reason}`);
        await log(new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('�( Ban')
          .addFields(
            { name: 'Cible', value: `${target.user.tag} (${target.id})`, inline: true },
            { name: 'Modérateur', value: message.author.tag, inline: true },
            { name: 'Raison', value: reason }
          ).setTimestamp()
        );
      } catch (e) {
        message.reply('❌ Impossible de bannir cet utilisateur.');
      }
      break;
    }

    // ---- !kick @user [raison] ----
    case 'kick': {
      const target = message.mentions.members.first();
      if (!target) return message.reply('❌ Mentionne un utilisateur. Ex: `!kick @user comportement`');
      const reason = args.slice(1).join(' ') || 'Aucune raison fournie';
      try {
        await target.kick(`${message.author.tag} : ${reason}`);
        await message.reply(`✅ **${target.user.tag}** a été expulsé. Raison : ${reason}`);
        await log(new EmbedBuilder()
          .setColor(0xFF6600)
          .setTitle('👢 Kick')
          .addFields(
            { name: 'Cible', value: `${target.user.tag} (${target.id})`, inline: true },
            { name: 'Modérateur', value: message.author.tag, inline: true },
            { name: 'Raison', value: reason }
          ).setTimestamp()
        );
      } catch (e) {
        message.reply('❌ Impossible d\'expulser cet utilisateur.');
      }
      break;
    }

    // ---- !mute @user [durée en minutes] [raison] ----
    case 'mute': {
      const target = message.mentions.members.first();
      if (!target) return message.reply('❌ Mentionne un utilisateur. Ex: `!mute @user 30 spam`');
      const duration = parseInt(args[1]) || 10; // minutes
      const reason = args.slice(2).join(' ') || 'Aucune raison fournie';
      try {
        await target.timeout(duration * 60 * 1000, `${message.author.tag} : ${reason}`);
        await message.reply(`✅ **${target.user.tag}** est réduit au silence pour **${duration} minutes**.`);
        await log(new EmbedBuilder()
          .setColor(0xFFA500)
          .setTitle('🔇 Mute')
          .addFields(
            { name: 'Cible', value: `${target.user.tag} (${target.id})`, inline: true },
            { name: 'Durée', value: `${duration} minutes`, inline: true },
            { name: 'Modérateur', value: message.author.tag, inline: true },
            { name: 'Raison', value: reason }
          ).setTimestamp()
        );
      } catch (e) {
        message.reply('❌ Impossible de muter cet utilisateur.');
      }
      break;
    }

    // ---- !unmute @user ----
    case 'unmute': {
      const target = message.mentions.members.first();
      if (!target) return message.reply('❌ Mentionne un utilisateur.');
      try {
        await target.timeout(null);
        await message.reply(`✅ **${target.user.tag}** peut de nouveau parler.`);
      } catch (e) {
        message.reply('❌ Impossible de démuter cet utilisateur.');
      }
      break;
    }

    // ---- !warn @user [raison] ----
    case 'warn': {
      const target = message.mentions.members.first();
      if (!target) return message.reply('❌ Mentionne un utilisateur.');
      const reason = args.slice(1).join(' ') || 'Comportement inapproprié';
      const count = autoMod.getWarnings(target.id) + 1;
      await log(new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle(`⚠️ Avertissement #${count}`)
        .addFields(
          { name: 'Cible', value: `${target.user.tag} (${target.id})`, inline: true },
          { name: 'Modérateur', value: message.author.tag, inline: true },
          { name: 'Raison', value: reason }
        ).setTimestamp()
      );
      try {
        await target.send(`⚠️ Tu as reçu un avertissement sur **${message.guild.name}**.\nRaison : ${reason}`);
      } catch (_) {}
      await message.reply(`✅ **${target.user.tag}** a reçu un avertissement. Raison : ${reason}`);
      break;
    }

    // ---- !warnings @user ----
    case 'warnings': {
      const target = message.mentions.members.first();
      if (!target) return message.reply('❌ Mentionne un utilisateur.');
      const count = autoMod.getWarnings(target.id);
      await message.reply(`📋 **${target.user.tag}** a **${count}** avertissement(s) auto-mod.`);
      break;
    }

    // ---- !clearwarns @user ----
    case 'clearwarns': {
      const target = message.mentions.members.first();
      if (!target) return message.reply('❌ Mentionne un utilisateur.');
      autoMod.clearWarnings(target.id);
      await message.reply(`✅ Les avertissements de **${target.user.tag}** ont été réinitialisés.`);
      break;
    }

    // ---- !purge [nombre] ----
    case 'purge':
    case 'clear': {
      const amount = Math.min(parseInt(args[0]) || 10, 100);
      try {
        const deleted = await message.channel.bulkDelete(amount, true);
        await message.channel.send(`🗑️ **${deleted.size}** message(s) supprimé(s).`)
          .then(m => setTimeout(() => m.delete().catch(() => {}), 4000));
        await log(new EmbedBuilder()
          .setColor(0x999999)
          .setTitle('🗑️ Purge')
          .addFields(
            { name: 'Salon', value: `<#${message.channel.id}>`, inline: true },
            { name: 'Messages supprimés', value: `${deleted.size}`, inline: true },
            { name: 'Modérateur', value: message.author.tag, inline: true }
          ).setTimestamp()
        );
      } catch (e) {
        message.reply('❌ Impossible de supprimer ces messages (peut-être trop anciens ?)');
      }
      break;
    }

    // ---- !lockdown on/off ----
    case 'lockdown': {
      const subCmd = args[0]?.toLowerCase();
      if (subCmd === 'off') {
        await antiRaid.deactivateLockdown(message.guild, log);
        await message.reply('✅ Lockdown désactivé manuellement.');
      } else {
        await antiRaid.activateLockdown(message.guild, log, 0);
        await message.reply('🔒 Lockdown activé manuellement.');
      }
      break;
    }

    // ---- !setup-verification ----
    case 'setup-verification': {
      if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.reply('❌ Seul un administrateur peut configurer la vérification.');
      }
      await message.reply('⏳ Création du message de vérification...');
      const msg = await verification.setupVerificationMessage(message.guild, client, log);
      if (msg) {
        await message.reply(`✅ Message de vérification créé dans <#${process.env.VERIFICATION_CHANNEL_ID}> !`);
      } else {
        await message.reply('❌ Erreur : vérifie que `VERIFICATION_CHANNEL_ID` est bien défini dans ton `.env`.');
      }
      break;
    }

    // ---- !status ----
    case 'status': {
      const cfg = require('./config.json');
      const embed = new EmbedBuilder()
        .setColor(0x7289DA)
        .setTitle('📊 Statut du bot SHABS Protect')
        .addFields(
          { name: '🛡️ Anti-Raid',       value: cfg.antiRaid.enabled     ? '✅ Actif' : '❌ Inactif', inline: true },
          { name: '🔇 Anti-Spam',       value: cfg.antiSpam.enabled     ? '✅ Actif' : '❌ Inactif', inline: true },
          { name: '✅ Vérification',    value: cfg.verification.enabled  ? '✅ Active' : '❌ Inactive', inline: true },
          { name: '🤖 Auto-Mod',        value: cfg.autoMod.enabled      ? '✅ Active' : '❌ Inactive', inline: true },
          { name: '📡 Latence',         value: `${client.ws.ping}ms`, inline: true },
          { name: '👥 Membres',         value: `${message.guild.memberCount}`, inline: true }
        )
        .setFooter({ text: 'Tanières des SHABS • SHABS Protect Bot' })
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
//  COMMANDE SETUP — Crée tout automatiquement sur le serveur
// ============================================================
async function handleSetup(message) {
  const { guild } = message;
  const statusMsg = await message.reply('⚙️ Configuration en cours... (cela peut prendre quelques secondes)');

  try {
    const results = [];

    // ---- 1. Créer le rôle Non-vérifié ----
    let unverifiedRole = guild.roles.cache.find(r => r.name === '🔒 Non-vérifié');
    if (!unverifiedRole) {
      unverifiedRole = await guild.roles.create({
        name: '🔒 Non-vérifié',
        color: 0x808080,
        reason: 'Setup SHABS Protect Bot',
        position: 1
      });
      results.push('✅ Rôle **🔒 Non-vérifié** créé');
    } else {
      results.push('⏭️ Rôle **🔒 Non-vérifié** déjà existant');
    }
    process.env.UNVERIFIED_ROLE_ID = unverifiedRole.id;

    // ---- 2. Créer le rôle Membre ----
    let memberRole = guild.roles.cache.find(r => r.name === '✅ Membre');
    if (!memberRole) {
      memberRole = await guild.roles.create({
        name: '✅ Membre',
        color: 0x57F287,
        reason: 'Setup SHABS Protect Bot',
        position: 2
      });
      results.push('✅ Rôle **✅ Membre** créé');
    } else {
      results.push('⏭️ Rôle **✅ Membre** déjà existant');
    }
    process.env.MEMBER_ROLE_ID = memberRole.id;

    // ---- 3. Créer le rôle Modérateur ----
    let modRole = guild.roles.cache.find(r => r.name === '🛡️ Modérateur');
    if (!modRole) {
      modRole = await guild.roles.create({
        name: '🛡️ Modérateur',
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
      results.push('✅ Rôle **🛡️ Modérateur** créé');
    } else {
      results.push('⏭️ Rôle **🛡️ Modérateur** déjà existant');
    }
    process.env.MOD_ROLE_ID = modRole.id;

    // ---- 4. Créer la catégorie SHABS PROTECT ----
    let category = guild.channels.cache.find(c => c.name === 'SHABS PROTECT' && c.type === 4);
    if (!category) {
      category = await guild.channels.create({
        name: 'SHABS PROTECT',
        type: 4, // CategoryChannel
        reason: 'Setup SHABS Protect Bot'
      });
    }

    // ---- 5. Créer le salon #logs-sécurité ----
    let logChannel = guild.channels.cache.find(c => c.name === 'logs-sécurité');
    if (!logChannel) {
      logChannel = await guild.channels.create({
        name: 'logs-sécurité',
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
      results.push('✅ Salon **#logs-sécurité** créé');
    } else {
      results.push('⏭️ Salon **#logs-sécurité** déjà existant');
    }
    process.env.LOG_CHANNEL_ID = logChannel.id;

    // ---- 6. Créer le salon #vérification ----
    let verifChannel = guild.channels.cache.find(c => c.name === 'vérification');
    if (!verifChannel) {
      verifChannel = await guild.channels.create({
        name: 'vérification',
        type: 0,
        parent: category.id;
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
      results.push('✅ Salon **#vérification** créé');
    } else {
      results.push('⏭️ Salon **#vérification** déjà existant');
    }
    process.env.VERIFICATION_CHANNEL_ID = verifChannel.id;

    // ---- 7. Restreindre @everyone aux canaux des non-vérifiés ----
    // Donner aux membres vérifiés l'accès à tout le reste
    // (configuration minimale — l'admin peut affiner)

    // ---- 8. Créer le message de vérification ----
    const log = createLogger(guild);
    await verification.setupVerificationMessage(guild, client, log);
    results.push('✅ Message de vérification envoyé dans **#vérification**');

    // ---- Résumé ----
    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('🎉 Configuration SHABS Protect terminée !')
      .setDescription(results.join('\n'))
      .addFields(
        { name: '📋 Récapitulatif des IDs', value:
          `Logs : <#${logChannel.id}>\n` +
          `Vérification : <#${verifChannel.id}>\n` +
          `Rôle Membre : <@&${memberRole.id}>\n` +
          `Rôle Modérateur : <@&${modRole.id}>\n` +
          `Rôle Non-vérifié : <@&${unverifiedRole.id}>`
        },
        { name: '📌 Prochaines étapes', value:
          '1. Attribue le rôle **🛡️ Modérateur** à tes mods\n' +
          '2. Attribue le rôle **🔒 Non-vérifié** aux nouveaux membres\n' +
          '3. Vérifie les permissions de tes salons existants\n' +
          '4. Tape `!aide` pour voir toutes les commandes'
        }
      )
      .setFooter({ text: 'Tanières des SHABS • SHABS Protect Bot' })
      .setTimestamp();

    await statusMsg.edit({ content: '', embeds: [embed] });

    // Log dans le canal de logs
    const logFn = createLogger(guild);
    await logFn(new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('⚙️ Setup complété')
      .setDescription(`Configuration effectuée par **${message.author.tag}**`)
      .setTimestamp()
    );

  } catch (err) {
    console.error('[Setup] Erreur:', err);
    await statusMsg.edit(`❌ Erreur lors de la configuration : \`${err.message}\`\nAssure-toi que le bot a la permission **Administrateur** sur le serveur.`);
  }
}

// ============================================================
//  EMBED D'AIDE
// ============================================================
function buildHelpEmbed() {
  return new EmbedBuilder()
    .setColor(0x7289DA)
    .setTitle('📖 SHABS Protect Bot — Commandes')
    .setDescription(`Préfixe : \`${PREFIX}\``)
    .addFields(
      {
        name: '🌐 Commandes publiques',
        value: [
          `\`${PREFIX}ping\` — Latence du bot`,
          `\`${PREFIX}aide\` — Ce menu d'aide`,
        ].join('\n')
      },
      {
        name: '🛡️ Modération (modérateurs)',
        value: [
          `\`${PREFIX}ban @user [raison]\` — Bannir`,
          `\`${PREFIX}kick @user [raison]\` — Expulser`,
          `\`${PREFIX}mute @user [minutes] [raison]\` — Réduire au silence`,
          `\`${PREFIX}unmute @user\` — Lever le silence`,
          `\`${PREFIX}warn @user [raison]\` — Avertir`,
          `\`${PREFIX}warnings @user\` — Voir les avertissements`,
          `\`${PREFIX}clearwarns @user\` — Effacer les avertissements`,
          `\`${PREFIX}purge [nombre]\` — Supprimer des messages (max 100)`,
          `\`${PREFIX}lockdown on/off\` — Verrouiller/déverrouiller le serveur`,
        ].join('\n')
      },
      {
        name: '⚙️ Administration',
        value: [
          `\`${PREFIX}setup-verification\` — Créer le message de vérification`,
          `\`${PREFIX}status\` — Statut des modules de protection`,
        ].join('\n')
      }
    )
    .setFooter({ text: 'Tanières des SHABS • SHABS Protect Bot' })
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
