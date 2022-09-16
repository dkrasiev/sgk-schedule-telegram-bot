const { chats } = require('../models');

module.exports = async (ctx, next) => {
  const chatId = ctx.chat.id;
  const chat = await chats.findOne({ id: chatId });

  if (!chat) {
    await chats.create({ id: chatId });
  }

  next();
};
