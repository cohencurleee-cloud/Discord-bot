const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  REST,
  Routes,
  Events
} = require("discord.js");

const fs = require("fs");
const crypto = require("crypto");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN) {
  console.error("Missing DISCORD_TOKEN environment variable.");
  process.exit(1);
}
if (!CLIENT_ID) {
  console.error("Missing CLIENT_ID environment variable.");
  process.exit(1);
}

const DATA_FILE = "./data.json";

const defaultData = {
  guilds: {},
  users: {},
  keys: {}
};

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) return structuredClone(defaultData);
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return structuredClone(defaultData);
  }
}

let db = loadData();

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function guildData(guildId) {
  if (!db.guilds[guildId]) {
    db.guilds[guildId] = {
      setup: false,
      channels: {},
      roles: {},
      logChannelId: null,
      levelRewards: [
        { level: 5, role: "Level 5" },
        { level: 10, role: "Level 10" },
        { level: 20, role: "Level 20" },
        { level: 30, role: "Level 30" }
      ]
    };
  }
  return db.guilds[guildId];
}

function userData(guildId, userId) {
  const key = guildId + ":" + userId;
  if (!db.users[key]) {
    db.users[key] = { xp: 0, level: 0, lastXp: 0, warnings: 0 };
  }
  return db.users[key];
}

function levelFromXp(xp) {
  return Math.floor(Math.sqrt(xp / 100));
}

function xpForLevel(level) {
  return level * level * 100;
}

function randomKey() {
  return "SF-" + crypto.randomBytes(12).toString("hex").toUpperCase();
}

function hashKey(key) {
  return crypto.createHash("sha256").update(key).digest("hex");
}

function isModerator(interaction) {
  return interaction.memberPermissions?.has(
    PermissionsBitField.Flags.ManageGuild
  );
}

async function sendLog(guild, title, description) {
  const config = guildData(guild.id);
  if (!config.logChannelId) return;

  const channel = guild.channels.cache.get(config.logChannelId);
  if (!channel?.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(() => {});
}

async function ensureRole(guild, name, options = {}) {
  let role = guild.roles.cache.find(r => r.name === name);
  if (!role) {
    role = await guild.roles.create({
      name,
      color: options.color,
      reason: "Community bot setup"
    });
  }
  return role;
}

const ROLE_SPECS = [
  ["👑 Owner", 0xED4245],
  ["💎 Co-Owner", 0xF1C40F],
  ["🛡️ Head Admin", 0xE67E22],
  ["🔨 Admin", 0xE74C3C],
  ["🛡️ Head Moderator", 0x9B59B6],
  ["🔧 Moderator", 0x5865F2],
  ["🧪 Trial Moderator", 0x3498DB],
  ["🎫 Support", 0x2ECC71],
  ["🛠️ Developer", 0x57F287],
  ["🎨 Designer", 0xEB459E],
  ["🤖 Bot", 0x95A5A6],
  ["📢 Announcements", 0xFEE75C],
  ["🤝 Partner", 0x1ABC9C],
  ["💎 Server Booster", 0xFF73FA],
  ["💰 Donator", 0xF1C40F],
  ["🌟 VIP", 0xFFD700],
  ["🏆 OG", 0xFF8C00],
  ["🎮 Gamer", 0x5865F2],
  ["🎵 Music", 0x1DB954],
  ["🎨 Creator", 0xE91E63],
  ["🟢 Active", 0x57F287],
  ["🔵 Member", 0x3498DB],
  ["⚪ New Member", 0x99AAB5],
  ["🌈 Community", 0x9B59B6],
  ["🔥 Event Winner", 0xF04747],
  ["🏅 Challenge Winner", 0xF1C40F],
  ["🧠 Expert", 0x7289DA],
  ["✨ Trusted", 0x00B0F4],
  ["🆘 Needs Help", 0xE91E63],
  ["🔇 Muted", 0x747F8D],
  ["🚫 Quarantined", 0x992D22],
  ["👻 AFK", 0x607D8B],
  ["📱 Mobile", 0x2ECC71],
  ["💻 PC", 0x3498DB],
  ["🎁 Giveaway Winner", 0xFF66CC],
  ["🔑 Script Tester", 0x00FFFF],
  ["📚 Script Member", 0x7289DA]
];

async function addRolePack(guild) {
  const roles = {};
  for (const [name, color] of ROLE_SPECS) {
    roles[name] = await ensureRole(guild, name, { color });
  }

  roles["✅ Verified"] = await ensureRole(guild, "✅ Verified", { color: 0x57F287 });

  const config = guildData(guild.id);
  for (const reward of config.levelRewards) {
    roles["🏆 " + reward.role] = await ensureRole(guild, "🏆 " + reward.role);
  }

  return roles;
}

async function ensureChannel(guild, name, parent = null, options = {}) {
  let channel = guild.channels.cache.find(c => c.name === name);
  if (!channel) {
    channel = await guild.channels.create({
      name,
      type: ChannelType.GuildText,
      parent,
      topic: options.topic,
      reason: "Community bot setup"
    });
  }
  return channel;
}

async function ensureCategory(guild, name) {
  let category = guild.channels.cache.find(
    c => c.type === ChannelType.GuildCategory && c.name === name
  );
  if (!category) {
    category = await guild.channels.create({
      name,
      type: ChannelType.GuildCategory,
      reason: "Community bot setup"
    });
  }
  return category;
}

async function runSetup(guild) {
  const config = guildData(guild.id);

  // Create/reuse the full role pack. Existing roles are reused.
  const createdRoles = await addRolePack(guild);

  const staffRole = createdRoles["🛡️ Head Moderator"];
  const verifiedRole = createdRoles["✅ Verified"];
  const mutedRole = createdRoles["🔇 Muted"];

  const levelRoles = {};
  for (const reward of config.levelRewards) {
    levelRoles[reward.level] = createdRoles["🏆 " + reward.role];
  }

  const infoCategory = await ensureCategory(guild, "📌 START HERE");
  const communityCategory = await ensureCategory(guild, "💬 COMMUNITY");
  const scriptsCategory = await ensureCategory(guild, "📜 SCRIPT HUB");
  const challengeCategory = await ensureCategory(guild, "🎯 CHALLENGES");
  const supportCategory = await ensureCategory(guild, "🆘 SUPPORT");
  const staffCategory = await ensureCategory(guild, "🔒 STAFF");

  const channels = {};

  const channelSpecs = [
    ["📜・rules", infoCategory, "Server rules and important information."],
    ["📢・announcements", infoCategory, "Official server announcements."],
    ["👋・welcome", infoCategory, "Welcome new members."],
    ["✅・verify", infoCategory, "Verify to access the community."],
    ["📖・server-info", infoCategory, "How the server works and useful links."],

    ["💬・general", communityCategory, "General community chat."],
    ["👋・introductions", communityCategory, "Introduce yourself to everyone."],
    ["😂・memes", communityCategory, "Memes and funny posts."],
    ["🖼️・media", communityCategory, "Screenshots, clips and other media."],
    ["💡・suggestions", communityCategory, "Suggest ideas for the community."],
    ["🏆・leaderboard", communityCategory, "Talk about XP, levels and community challenges."],
    ["🤖・bot-commands", communityCategory, "Use bot commands here."],

    ["📚・script-library", scriptsCategory, "Scripts and resources you are authorized to distribute."],
    ["🆕・script-releases", scriptsCategory, "New script/resource releases."],
    ["⭐・script-showcase", scriptsCategory, "Showcase your own projects."],
    ["🔑・key-help", scriptsCategory, "Help with keys for scripts you own or are authorized to distribute."],
    ["🐛・bug-reports", scriptsCategory, "Report bugs in community resources."],

    ["🖥️・pc-challenges", challengeCategory, "PC-focused challenges and submissions."],
    ["📱・mobile-challenges", challengeCategory, "Mobile-focused challenges and submissions."],
    ["🎮・executor-challenges", challengeCategory, "Executor-themed challenges using resources you are authorized to use."],
    ["📤・challenge-submissions", challengeCategory, "Post your challenge submissions here."],
    ["🏅・challenge-results", challengeCategory, "Challenge results and winners."],

    ["🎫・create-ticket", supportCategory, "Open a private support ticket."],
    ["❓・help", supportCategory, "Community help and questions."],
    ["📋・faq", supportCategory, "Frequently asked questions."],

    ["📜・mod-logs", staffCategory, "Moderation and AutoMod logs."],
    ["🛡️・staff-chat", staffCategory, "Private staff discussion."],
    ["🚨・alerts", staffCategory, "Important moderation alerts."]
  ];

  for (const [name, parent, topic] of channelSpecs) {
    channels[name] = await ensureChannel(guild, name, parent, { topic });
  }

  const rules = channels["📜・rules"];
  const announcements = channels["📢・announcements"];
  const verify = channels["✅・verify"];
  const tickets = channels["🎫・create-ticket"];
  const logs = channels["📜・mod-logs"];

  config.channels = Object.fromEntries(
    Object.entries(channels).map(([name, channel]) => [name, channel.id])
  );
  config.channels.tickets = tickets.id;
  config.logChannelId = logs.id;
  config.roles = {
    staff: staffRole.id,
    verified: verifiedRole.id,
    muted: mutedRole.id,
    ...Object.fromEntries(
      Object.entries(createdRoles).map(([name, role]) => [
        name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""),
        role.id
      ])
    ),
    ...Object.fromEntries(
      Object.entries(levelRoles).map(([level, role]) => ["level" + level, role.id])
    )
  };
  config.setup = true;
  saveData();

  await rules.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("📜 Server Rules")
        .setDescription(
          "1. Respect everyone.\\n" +
          "2. No spam, raids or mass mentions.\\n" +
          "3. No malicious files or links.\\n" +
          "4. Only share scripts/resources you own or are authorized to distribute.\\n" +
          "5. Keep posts in the correct channels.\\n" +
          "6. Follow Discord's rules and staff instructions."
        )
        .setColor(0x5865f2)
    ]
  }).catch(() => {});

  await announcements.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("📢 Server Ready")
        .setDescription("The community is set up. Check the channels above and start exploring!")
        .setColor(0x5865f2)
    ]
  }).catch(() => {});

  const verifyRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("verify_member")
      .setLabel("✅ Verify")
      .setStyle(ButtonStyle.Success)
  );

  await verify.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("✅ Verify")
        .setDescription("Click the button below to get access to the community.")
        .setColor(0x57f287)
    ],
    components: [verifyRow]
  }).catch(() => {});

  const ticketRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("open_ticket")
      .setLabel("🎫 Open Ticket")
      .setStyle(ButtonStyle.Primary)
  );

  await tickets.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("🎫 Support")
        .setDescription("Need help? Open a private ticket with the button below.")
        .setColor(0x5865f2)
    ],
    components: [ticketRow]
  }).catch(() => {});

  return config;
}

const commands = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Build the community server channels, roles and panels.")
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild.toString()),

  new SlashCommandBuilder()
    .setName("role-add")
    .setDescription("Add the full server role pack.")
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild.toString()),

  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check if the bot is online."),

  new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Show your level and XP.")
    .addUserOption(o => o.setName("user").setDescription("User to check")),

  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Show the server XP leaderboard."),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a member.")
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers.toString())
    .addUserOption(o => o.setName("user").setDescription("Member to warn").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason")),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a member.")
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers.toString())
    .addUserOption(o => o.setName("user").setDescription("Member to timeout").setRequired(true))
    .addIntegerOption(o => o.setName("minutes").setDescription("Minutes").setMinValue(1).setMaxValue(10080).setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason")),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member.")
    .setDefaultMemberPermissions(PermissionsBitField.Flags.KickMembers.toString())
    .addUserOption(o => o.setName("user").setDescription("Member to kick").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason")),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a member.")
    .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers.toString())
    .addUserOption(o => o.setName("user").setDescription("Member to ban").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason")),

  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Open a private support ticket."),

  new SlashCommandBuilder()
    .setName("key")
    .setDescription("Manage keys for your own scripts.")
    .addSubcommand(s => s.setName("create").setDescription("Create a key.")
      .addStringOption(o => o.setName("note").setDescription("Optional note")))
    .addSubcommand(s => s.setName("check").setDescription("Check a key.")
      .addStringOption(o => o.setName("key").setDescription("Key").setRequired(true)))
    .addSubcommand(s => s.setName("revoke").setDescription("Revoke a key.")
      .addStringOption(o => o.setName("key").setDescription("Key").setRequired(true))),

  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete recent messages.")
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages.toString())
    .addIntegerOption(o => o.setName("amount").setDescription("1-100").setMinValue(1).setMaxValue(100).setRequired(true))
].map(c => c.toJSON());

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Channel, Partials.Message]
});

const spamTracker = new Map();

client.once(Events.ClientReady, async ready => {
  console.log(`Logged in as ${ready.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log("Slash commands registered.");
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isButton()) {
      if (interaction.customId === "verify_member") {
        const config = guildData(interaction.guild.id);
        const role = interaction.guild.roles.cache.get(config.roles?.verified);

        if (!role) {
          return interaction.reply({ content: "Verification is not configured yet.", ephemeral: true });
        }

        await interaction.member.roles.add(role, "Community verification");
        return interaction.reply({ content: "You're verified.", ephemeral: true });
      }

      if (interaction.customId === "open_ticket") {
        return openTicket(interaction);
      }

      if (interaction.customId === "close_ticket") {
        await interaction.reply("Closing ticket...");
        setTimeout(() => interaction.channel.delete("Ticket closed").catch(() => {}), 1500);
        return;
      }
    }

    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "ping") {
      return interaction.reply(`Pong! ${client.ws.ping}ms`);
    }

    if (interaction.commandName === "role-add") {
      if (!isModerator(interaction)) {
        return interaction.reply({ content: "You need Manage Server.", ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });
      const roles = await addRolePack(interaction.guild);
      saveData();
      return interaction.editReply(
        `Done. Added/reused ${Object.keys(roles).length} roles. No channels or other server setup was changed.`
      );
    }

    if (interaction.commandName === "setup") {
      if (!isModerator(interaction)) return interaction.reply({ content: "You need Manage Server.", ephemeral: true });
      await interaction.deferReply({ ephemeral: true });
      await runSetup(interaction.guild);
      return interaction.editReply("Done. I built the server layout, roles, verification panel, ticket panel, rules and logs.");
    }

    if (interaction.commandName === "rank") {
      const target = interaction.options.getUser("user") || interaction.user;
      const data = userData(interaction.guild.id, target.id);
      const level = levelFromXp(data.xp);
      const next = xpForLevel(level + 1);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`${target.username}'s Rank`)
            .setDescription(`**Level:** ${level}\n**XP:** ${data.xp} / ${next}\n**Warnings:** ${data.warnings}`)
            .setThumbnail(target.displayAvatarURL())
            .setColor(0x5865f2)
        ]
      });
    }

    if (interaction.commandName === "leaderboard") {
      const rows = Object.entries(db.users)
        .filter(([key]) => key.startsWith(interaction.guild.id + ":"))
        .sort((a, b) => b[1].xp - a[1].xp)
        .slice(0, 10);

      const text = rows.length
        ? rows.map(([key, data], i) => {
            const userId = key.split(":")[1];
            return `**${i + 1}.** <@${userId}> — Level ${levelFromXp(data.xp)} (${data.xp} XP)`;
          }).join("\n")
        : "Nobody has earned XP yet.";

      return interaction.reply({
        embeds: [new EmbedBuilder().setTitle("XP Leaderboard").setDescription(text).setColor(0xfee75c)]
      });
    }

    if (interaction.commandName === "warn") {
      const member = interaction.options.getMember("user");
      const reason = interaction.options.getString("reason") || "No reason given";
      if (!member) return interaction.reply({ content: "Member not found.", ephemeral: true });
      if (member.id === interaction.user.id) return interaction.reply({ content: "You can't warn yourself.", ephemeral: true });

      const data = userData(interaction.guild.id, member.id);
      data.warnings++;
      saveData();

      await member.send(`You were warned in **${interaction.guild.name}**. Reason: ${reason}`).catch(() => {});
      await sendLog(interaction.guild, "Member Warned", `<@${member.id}> was warned by <@${interaction.user.id}>.\nReason: ${reason}`);
      return interaction.reply(`Warned <@${member.id}>. They now have **${data.warnings}** warning(s).`);
    }

    if (interaction.commandName === "timeout") {
      const member = interaction.options.getMember("user");
      const minutes = interaction.options.getInteger("minutes");
      const reason = interaction.options.getString("reason") || "No reason given";
      if (!member) return interaction.reply({ content: "Member not found.", ephemeral: true });

      await member.timeout(minutes * 60 * 1000, reason);
      await sendLog(interaction.guild, "Member Timed Out", `<@${member.id}> was timed out by <@${interaction.user.id}> for ${minutes} minute(s).\nReason: ${reason}`);
      return interaction.reply(`Timed out <@${member.id}> for **${minutes} minute(s)**.`);
    }

    if (interaction.commandName === "kick") {
      const member = interaction.options.getMember("user");
      const reason = interaction.options.getString("reason") || "No reason given";
      if (!member) return interaction.reply({ content: "Member not found.", ephemeral: true });

      await member.kick(reason);
      await sendLog(interaction.guild, "Member Kicked", `<@${member.id}> was kicked by <@${interaction.user.id}>.\nReason: ${reason}`);
      return interaction.reply(`Kicked <@${member.id}>.`);
    }

    if (interaction.commandName === "ban") {
      const member = interaction.options.getMember("user");
      const reason = interaction.options.getString("reason") || "No reason given";
      if (!member) return interaction.reply({ content: "Member not found.", ephemeral: true });

      await member.ban({ reason });
      await sendLog(interaction.guild, "Member Banned", `<@${member.id}> was banned by <@${interaction.user.id}>.\nReason: ${reason}`);
      return interaction.reply(`Banned <@${member.id}>.`);
    }

    if (interaction.commandName === "ticket") {
      return openTicket(interaction);
    }

    if (interaction.commandName === "purge") {
      const amount = interaction.options.getInteger("amount");
      await interaction.channel.bulkDelete(amount, true);
      return interaction.reply({ content: `Deleted up to ${amount} messages.`, ephemeral: true });
    }

    if (interaction.commandName === "key") {
      if (!isModerator(interaction)) {
        return interaction.reply({ content: "You need Manage Server to manage keys.", ephemeral: true });
      }

      const sub = interaction.options.getSubcommand();

      if (sub === "create") {
        const raw = randomKey();
        db.keys[hashKey(raw)] = {
          createdAt: Date.now(),
          createdBy: interaction.user.id,
          note: interaction.options.getString("note") || "",
          revoked: false,
          guildId: interaction.guild.id
        };
        saveData();

        return interaction.reply({
          content: `Created key: \`\`${raw}\`\`\nKeep it private. This system is for keys belonging to your own scripts.`,
          ephemeral: true
        });
      }

      const raw = interaction.options.getString("key");
      const record = db.keys[hashKey(raw)];

      if (sub === "check") {
        if (!record || record.guildId !== interaction.guild.id || record.revoked) {
          return interaction.reply({ content: "That key is invalid or revoked.", ephemeral: true });
        }
        return interaction.reply({ content: `Valid key. Note: ${record.note || "None"}`, ephemeral: true });
      }

      if (sub === "revoke") {
        if (!record || record.guildId !== interaction.guild.id) {
          return interaction.reply({ content: "Key not found.", ephemeral: true });
        }
        record.revoked = true;
        record.revokedAt = Date.now();
        saveData();
        return interaction.reply({ content: "Key revoked.", ephemeral: true });
      }
    }
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ content: "Something went wrong. Check the bot logs." }).catch(() => {});
    } else {
      await interaction.reply({ content: "Something went wrong. Check the bot logs.", ephemeral: true }).catch(() => {});
    }
  }
});

async function openTicket(interaction) {
  const guild = interaction.guild;
  const existing = guild.channels.cache.find(
    c => c.name === `ticket-${interaction.user.id}`
  );

  if (existing) {
    return interaction.reply({
      content: `You already have a ticket: <#${existing.id}>`,
      ephemeral: true
    });
  }

  const config = guildData(guild.id);
  const staffRoleId = config.roles?.staff;

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionsBitField.Flags.ViewChannel]
    },
    {
      id: interaction.user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory
      ]
    }
  ];

  if (staffRoleId) {
    overwrites.push({
      id: staffRoleId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageMessages
      ]
    });
  }

  const channel = await guild.channels.create({
    name: `ticket-${interaction.user.id}`,
    type: ChannelType.GuildText,
    parent: config.channels?.tickets
      ? guild.channels.cache.get(config.channels.tickets)?.parentId
      : undefined,
    permissionOverwrites: overwrites,
    topic: `Support ticket for ${interaction.user.tag}`
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("close_ticket")
      .setLabel("Close Ticket")
      .setStyle(ButtonStyle.Danger)
  );

  await channel.send({
    content: `<@&${staffRoleId || guild.roles.everyone.id}> <@${interaction.user.id}>`,
    embeds: [
      new EmbedBuilder()
        .setTitle("Support Ticket")
        .setDescription("Tell the staff what you need help with. Do not post passwords or private tokens.")
        .setColor(0x5865f2)
    ],
    components: [row]
  });

  return interaction.reply({
    content: `Ticket created: <#${channel.id}>`,
    ephemeral: true
  });
}

client.on(Events.MessageCreate, async message => {
  if (!message.guild || message.author.bot) return;

  const content = message.content.toLowerCase();
  const key = message.guild.id + ":" + message.author.id;
  const now = Date.now();

  // Simple spam protection.
  const recent = spamTracker.get(key) || [];
  recent.push(now);
  while (recent.length && now - recent[0] > 6000) recent.shift();
  spamTracker.set(key, recent);

  if (recent.length >= 7) {
    await message.delete().catch(() => {});
    const member = message.member;
    if (member?.moderatable) {
      await member.timeout(30 * 1000, "Automatic spam protection").catch(() => {});
    }
    await sendLog(message.guild, "AutoMod: Spam", `<@${message.author.id}> triggered spam protection.`);
    return;
  }

  // Mass-mention protection.
  if (message.mentions.users.size + message.mentions.roles.size >= 6) {
    await message.delete().catch(() => {});
    await sendLog(message.guild, "AutoMod: Mass Mention", `<@${message.author.id}> sent a mass mention message.`);
    return;
  }

  // Common URL shorteners are treated as suspicious by default.
  const suspiciousDomains = [
    "bit.ly/",
    "tinyurl.com/",
    "cutt.ly/",
    "shorturl.at/"
  ];

  if (suspiciousDomains.some(domain => content.includes(domain))) {
    await message.delete().catch(() => {});
    await message.channel.send({
      content: `🤖 I removed that link automatically because it matched a suspicious-link filter. Ask staff if it was legitimate.`
    }).then(m => setTimeout(() => m.delete().catch(() => {}), 5000)).catch(() => {});
    await sendLog(message.guild, "AutoMod: Suspicious Link", `Removed a shortened link from <@${message.author.id}>.`);
    return;
  }

  // XP cooldown.
  const data = userData(message.guild.id, message.author.id);
  if (now - data.lastXp >= 60_000) {
    const oldLevel = levelFromXp(data.xp);
    data.xp += Math.floor(Math.random() * 11) + 10;
    data.lastXp = now;

    const newLevel = levelFromXp(data.xp);
    if (newLevel > oldLevel) {
      const config = guildData(message.guild.id);
      const reward = config.levelRewards.find(r => r.level === newLevel);

      if (reward) {
        const role = message.guild.roles.cache.find(r => r.name === `🏆 ${reward.role}`) || message.guild.roles.cache.find(r => r.name === reward.role);
        if (role && message.member.manageable) {
          await message.member.roles.add(role, "Level reward").catch(() => {});
        }
      }

      await message.channel.send(`🤖 I just sent an automatic update: 🎉 <@${message.author.id}> reached **Level ${newLevel}**!`).then(m => {
        setTimeout(() => m.delete().catch(() => {}), 8000);
      }).catch(() => {});
    }

    saveData();
  }
});

process.on("SIGTERM", () => {
  saveData();
  client.destroy();
  process.exit(0);
});

process.on("SIGINT", () => {
  saveData();
  client.destroy();
  process.exit(0);
});

client.login(TOKEN);
