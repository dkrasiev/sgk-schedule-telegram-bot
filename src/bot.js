const {Telegraf} = require('telegraf');

let token = process.env.BOT_TOKEN;
if (process.env.ENV_MODE === 'dev') {
  token = process.env.BOT_TOKEN_TEST;
}

const bot = new Telegraf(token);

const botCommands = [
  {command: 'schedule', description: 'Расписание на два дня'},
  {command: 'today', description: 'Расписание на сегодня'},
  {command: 'tomorrow', description: 'Расписание на завтра'},
  {command: 'help', description: 'Показать помощь'},
  {command: 'groups', description: 'Показать все существующие группы'},
  {command: 'setgroup', description: 'Изменить группу по-умолчанию'},
  {
    command: 'subscribe',
    description: 'Подписаться на обновления расписания',
  },
  {
    command: 'unsubscribe',
    description: 'Отписаться от обновлений расписания',
  },
];

bot.telegram.setMyCommands(botCommands);

bot.launch();

module.exports = bot;
