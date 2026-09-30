export const POLICY = [
  { name: "Terms of Service", url: "https://discord.com/terms" },
  { name: "Community Guidelines", url: "https://discord.com/guidelines" },
  { name: "Privacy Policy", url: "https://discord.com/privacy" },
];

export function memberRulesEmbed() {
  return {
    color: 0xd6ff4a,
    title: "SINS CENTRAL rules",
    description: [
      "By staying here you agree to these rules and to Discord's policies.",
      "",
      "**1.** Be respectful. No harassment, hate, or targeted attacks.",
      "**2.** No NSFW, illegal content, or anything that breaks Discord's rules.",
      "**3.** No spam, raids, mass mentions, or scam links.",
      "**4.** No advertising or self-promotion unless staff has allowed it.",
      "**5.** Keep topics in the right channels.",
      "**6.** Purchases and support go through tickets. Don't DM staff to skip the line.",
      "**7.** Follow staff. Timeouts, kicks, and bans are not optional.",
      "**8.** Don't evade punishments with another account.",
    ].join("\n"),
    fields: POLICY.map((item) => ({
      name: item.name,
      value: item.url,
      inline: true,
    })),
    footer: { text: "Ty Bot" },
  };
}

export function staffRulesEmbed() {
  return {
    color: 0xc8a24a,
    title: "SINS CENTRAL | STAFF RULES",
    description: [
      "Staff members represent SINS CENTRAL and are expected to keep the community welcoming, organized, and fair.",
      "",
      "**1 | Treat members with respect**",
      "Having a staff role doesn't give anyone permission to disrespect, embarrass, or unnecessarily argue with members.",
      "",
      "**2 | Moderate fairly**",
      "Apply the rules consistently. Don't punish someone because of a personal disagreement or friendship.",
      "",
      "**3 | Don't abuse permissions**",
      "Never misuse moderation commands, roles, channel permissions, kicks, bans, or other staff privileges.",
      "",
      "**4 | Keep staff information private**",
      "Private staff discussions, reports, tickets, and internal information should stay within the appropriate staff channels.",
      "",
      "**5 | Handle tickets professionally**",
      "Be respectful and helpful when dealing with support or purchase tickets. Don't close someone's ticket before their issue has been properly addressed.",
      "",
      "**6 | Never mislead customers**",
      "Be clear about products, pricing, availability, and what members are receiving.",
      "",
      "**7 | No self-promotion**",
      "Staff members must follow the same advertising and self-promotion rules as everyone else unless specifically authorized.",
      "",
      "**8 | Work as a team**",
      "Don't publicly fight with another staff member. Handle disagreements privately or involve higher staff when necessary.",
      "",
      "**9 | Don't speak for the owner without permission**",
      "Don't make promises, announce major changes, or claim something is officially approved unless you're authorized to do so.",
      "",
      "**10 | Set the example**",
      "Staff should demonstrate the behavior expected from the rest of the community.",
      "",
      "Respect the community. Protect the community. Represent SINS CENTRAL.",
    ].join("\n"),
    footer: { text: "Ty Bot · staff only" },
  };
}
