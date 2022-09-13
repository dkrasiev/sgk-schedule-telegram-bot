const { Composer, Markup } = require("telegraf");

const {
  startSubscription,
  stopSubscription,
} = require("../services/chat.service");
const {
  sendSchedule,
  getHelpMessage,
  getMessageAllGroups,
  getMessageSchedule,
  getSchedule,
  getGroupFromMessage,
} = require("../helpers/utils");
const dayjs = require("dayjs");

const composer = new Composer();

composer.start(async (ctx) => {
  const message =
    "Привет, " +
    ctx.from.first_name +
    '\n"Чтобы узнать как я работаю, введи команду /help"';

  await ctx.reply(message);
});

composer.help(async (ctx) => {
  const inlineKeyboard = ctx.data.chat.defaultGroup
    ? Markup.inlineKeyboard([
        Markup.button.callback(
          "Удалить группу по умолчанию",
          "remove_default_group"
        ),
      ])
        .oneTime()
        .resize()
    : undefined;

  await ctx.reply(await getHelpMessage(ctx.chat.id), inlineKeyboard);
});

composer.action("remove_default_group", async (ctx) => {
  let resultMessage = "Группа по умолчанию удалена";

  if (!ctx.data.chat.defaultGroup) {
    resultMessage = "Группа по умолчанию не задана";
  } else {
    ctx.data.chat.defaultGroup = null;
    await ctx.data.chat.save();
  }

  await ctx.answerCbQuery();
  await ctx.reply(resultMessage);
});

composer.command("groups", async (ctx) => {
  await ctx.reply(await getMessageAllGroups());
});

composer.command("setgroup", async (ctx) => {
  const group = await getGroupFromMessage(ctx.message.text);

  if (group) {
    ctx.data.chat.defaultGroup = group.id;
    await ctx.data.chat.save();
  } else {
    await ctx.reply("Группа не найдена или Вы ничего не ввели");
    return;
  }

  await ctx.reply(`Группа ${ctx.data.group.name} установлена по-умолчанию`);
});

composer.command("subscribe", async (ctx) => {
  await startSubscription(ctx.chat.id, ctx.data.group.id);
  await ctx.reply(
    `Вы подписались на рассылку расписания группы ${ctx.data.group.name}`
  );
});

composer.command("unsubscribe", async (ctx) => {
  if (await stopSubscription(ctx.chat.id)) {
    await ctx.reply("Вы отписались от рассылки расписания");
  } else {
    await ctx.reply("Вы не подписаны на рассылку расписания");
  }
});

composer.command("schedule", async (ctx) => {
  await sendSchedule(ctx, ctx.data.chat, ctx.data.group);
});

composer.command("today", async (ctx) => {
  const schedule = await getSchedule(ctx.data.group.id, dayjs());

  await ctx.reply(await getMessageSchedule(schedule, ctx.data.group));
});

composer.command("tomorrow", async (ctx) => {
  const schedule = await getSchedule(ctx.data.group.id, dayjs().add(1, "day"));

  await ctx.reply(await getMessageSchedule(schedule, ctx.data.group));
});

composer.hears(/расписание/, async (ctx) => {
  if (!ctx.data.group) {
    await ctx.reply("Группа не найдена или Вы ничего не ввели");
    return;
  }

  await sendSchedule(ctx, ctx.data.chat, ctx.data.group);
});

composer.hears(/[А-я]{1,3}[\W]?\d{2}[\W]?\d{2}/g, async (ctx) => {
  if (ctx.chat.type === "private") {
    if (ctx.data.chat && ctx.data.group) {
      await sendSchedule(ctx, ctx.data.chat, ctx.data.group);
    } else {
      await ctx.reply("Группа не найдена");
    }
  }
});

module.exports = composer;
