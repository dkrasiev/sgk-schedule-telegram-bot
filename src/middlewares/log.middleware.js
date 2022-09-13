const dayjs = require("dayjs");

module.exports = async (ctx, next) => {
  const date = `[${dayjs().format("HH:mm")}]`;
  const user =
    (ctx.from.username ||
      [ctx.from.first_name, ctx.from.last_name].filter((a) => a).join(" ")) +
    ":";
  const message = `${ctx.message.text}`;

  console.log([date, user, message].join(" "));

  next();
};
