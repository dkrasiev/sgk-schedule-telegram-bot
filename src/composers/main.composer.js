const { chats } = require("../models");
const { Composer, Markup } = require("telegraf");

const {
  startSubscription,
  stopSubscription,
} = require("../services/chat.service");
const {
  getGroupFromMessage,
  getGroupByChatId,
  sendSchedule,
  getHelpMessage,
  getMessageAllGroups,
} = require("../helpers/utils");

const composer = new Composer();

composer.start(async (ctx) => {
  const message =
    "Привет, " +
    ctx.from.first_name +
    '\n"Чтобы узнать как я работаю, введи команду /help"';

  await ctx.reply(message);
});

composer.help(async (ctx) => {
  const chat = await chats.findOne({ id: ctx.chat.id });

  const inlineKeyboard = chat.defaultGroup
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
  const chat = await chats.findOne({ id: ctx.chat.id });
  let resultMessage = "Группа по умолчанию удалена";

  if (!chat.defaultGroup) {
    resultMessage = "Группа по умолчанию не задана";
  } else {
    chat.defaultGroup = null;
    await chat.save();
  }

  await ctx.answerCbQuery();
  await ctx.reply(resultMessage);
});

composer.command("groups", async (ctx) => {
  await ctx.reply(await getMessageAllGroups());
});

composer.command("setgroup", async (ctx) => {
  const group = await getGroupFromMessage(ctx.message.text);
  const chat = await chats.findOne({ id: ctx.chat.id });

  if (!group) {
    await ctx.reply("Группа не найдена или Вы ничего не ввели");
    return;
  }

  chat.defaultGroup = group.id;
  await chat.save();

  await ctx.reply(`Группа ${group.name} установлена по-умолчанию`);
});

composer.command("subscribe", async (ctx) => {
  const group =
    (await getGroupFromMessage(ctx.message.text)) ||
    (await getGroupByChatId(ctx.chat.id));

  if (!group) {
    await ctx.reply("Группа не найдена или вы ничего не ввели");
    return;
  }

  await startSubscription(ctx.chat.id, group.id);
  await ctx.reply(`Вы подписались на рассылку расписания группы ${group.name}`);
});

composer.command("unsubscribe", async (ctx) => {
  const chatId = ctx.chat.id;
  if (await stopSubscription(chatId)) {
    await ctx.reply("Вы отписались от рассылки расписания");
  } else {
    await ctx.reply("Вы не подписаны на рассылку расписания");
  }
});

composer.command("schedule", async (ctx) => {
  const group =
    (await getGroupFromMessage(ctx.message.text)) ||
    (await getGroupByChatId(ctx.chat.id));
  const chat = await chats.findOne({ id: ctx.chat.id });

  if (!group) {
    await ctx.reply("Группа не найдена");
    return;
  }

  await sendSchedule(ctx, chat, group);
});

composer.hears(/расписание/, async (ctx) => {
  const group =
    (await getGroupFromMessage(ctx.message.text)) ||
    (await getGroupByChatId(ctx.chat.id));
  const chat = await chats.findOne({ id: ctx.chat.id });

  if (!group) {
    await ctx.reply("Группа не найдена");
    return;
  }

  await sendSchedule(ctx, chat, group);
});

composer.hears(/[А-я]{1,3}[\W]?\d{2}[\W]?\d{2}/g, async (ctx) => {
  const group = await getGroupFromMessage(ctx.message.text);
  const chat = await chats.findOne({ id: ctx.chat.id });

  if (ctx.chat.type === "private") {
    if (chat && group) {
      await sendSchedule(ctx, chat, group);
    } else {
      await ctx.reply("Группа не найдена");
    }
  }
});

module.exports = composer;
