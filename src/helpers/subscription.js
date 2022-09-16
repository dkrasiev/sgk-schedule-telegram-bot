const dayjs = require('dayjs');
const { default: axios } = require('axios');
const { chats } = require('../models');
const { getNextWorkDate } = require('../helpers/utils');
const { SCHEDULE_API } = require('../helpers/api');

async function startSubscription(chatId, groupId) {
  const dateNext = getNextWorkDate(getNextWorkDate(dayjs().add(1, 'day')));
  const currentSchedule = (
    await axios.get(
        SCHEDULE_API + '/' + groupId + '/' + dateNext.format('YYYY-MM-DD'),
    )
  ).data;
  const chat = await chats.findOne({ chatId });

  chat.subscription = {
    groupId,
    lastSchedule: currentSchedule,
  };

  await chat.save();
}

async function stopSubscription(chatId) {
  const chat = await chats.findOne({ id: chatId });

  if (!chat.subscription?.groupId) {
    return false;
  }

  chat.subscription = null;
  await chat.save();

  return true;
}

module.exports = { startSubscription, stopSubscription };
