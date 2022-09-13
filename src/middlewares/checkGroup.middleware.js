module.exports = async (ctx, next) => {
  if (!ctx.data.group) {
    await ctx.reply("Группа не найдена или Вы ничего не ввели");
    return;
  }

  next();
};
