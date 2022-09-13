const { getGroupFromMessage, getGroupByChatId } = require("../helpers/utils");
const { chats } = require("../models");

module.exports = async (ctx, next) => {
  const chat = await chats.findOne({ id: ctx.chat.id });
  const group =
    (await getGroupFromMessage(ctx.message?.text)) ||
    (await getGroupByChatId(ctx.chat.id));

  ctx.data = { chat, group };

  next();
};
