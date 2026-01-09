import type { MessageDetail } from '@/lib/types';

const subjects = [
  'Важное обновление',
  'Встреча завтра в 15:00',
  'Отчет готов к просмотру',
  'Вопрос по проекту',
  'Новая задача назначена',
  'Обновление статуса',
  'Требуется ваше внимание',
  'Еженедельный отчет',
  'Напоминание о дедлайне',
  'Результаты тестирования',
];

const senders = [
  { email: 'colleague1@company.com', name: 'Иван Иванов' },
  { email: 'colleague2@company.com', name: 'Мария Петрова' },
  { email: 'manager@company.com', name: 'Алексей Сидоров' },
  { email: 'team@company.com', name: 'Команда разработки' },
  { email: 'support@company.com', name: 'Служба поддержки' },
  { email: 'noreply@service.com', name: 'Автоматическая рассылка' },
  { email: 'client@external.com', name: 'Клиент Внешний' },
  { email: 'partner@partner.com', name: 'Партнер Компания' },
];

const textBodies = [
  'Здравствуйте! Это важное сообщение, требующее вашего внимания.',
  'Добрый день! Прошу ознакомиться с прикрепленным документом.',
  'Привет! Можем обсудить детали проекта на встрече?',
  'Уважаемый коллега, необходимо ваше решение по данному вопросу.',
  'Напоминаю о предстоящем дедлайне. Пожалуйста, подготовьте материалы.',
  'Спасибо за проделанную работу. Отчет выглядит отлично!',
  'Требуется ваше подтверждение для продолжения работы.',
  'Обновление: статус задачи изменен на "В работе".',
];

const htmlBodies = [
  '<p>Здравствуйте!</p><p>Это <strong>важное</strong> сообщение, требующее вашего внимания.</p>',
  '<p>Добрый день!</p><p>Прошу ознакомиться с прикрепленным документом.</p><ul><li>Пункт 1</li><li>Пункт 2</li></ul>',
  '<p>Привет!</p><p>Можем обсудить детали проекта на встрече?</p><p>С уважением,<br/>Команда</p>',
  '<p>Уважаемый коллега,</p><p>Необходимо ваше решение по данному вопросу.</p>',
  '<h2>Напоминание</h2><p>О предстоящем дедлайне. Пожалуйста, подготовьте материалы.</p>',
  '<p>Спасибо за проделанную работу.</p><p>Отчет выглядит <em>отлично</em>!</p>',
  '<p>Требуется ваше подтверждение для продолжения работы.</p>',
  '<p><strong>Обновление:</strong> статус задачи изменен на "В работе".</p>',
];

function seededRandom(seed: string): () => number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }

  let state = hash;
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

export function generateMockData(count: number, seed: string, userEmail: string): MessageDetail[] {
  const random = seededRandom(seed);
  const messages: MessageDetail[] = [];
  const baseTime = Date.now() - 30 * 24 * 60 * 60 * 1000;

  for (let i = 0; i < count; i++) {
    const sender = senders[Math.floor(random() * senders.length)];
    const subject = subjects[Math.floor(random() * subjects.length)];
    const textBody = textBodies[Math.floor(random() * textBodies.length)];
    const htmlBody = htmlBodies[Math.floor(random() * htmlBodies.length)];

    const daysAgo = Math.floor(random() * 30);
    const hoursAgo = Math.floor(random() * 24);
    const minutesAgo = Math.floor(random() * 60);
    const date = new Date(baseTime + daysAgo * 24 * 60 * 60 * 1000 + hoursAgo * 60 * 60 * 1000 + minutesAgo * 60 * 1000);

    const folderTypes = ['inbox', 'sent', 'drafts'];
    const folderType = folderTypes[Math.floor(random() * folderTypes.length)];

    const messageId = `${folderType}_${i}_${Math.random().toString(36).substring(2, 15)}`;
    const threadId = Math.random() > 0.7 ? `thread_${Math.floor(random() * 100)}` : messageId;

    const hasAttachments = random() > 0.7;
    const attachments = hasAttachments
      ? [
          {
            id: `${messageId}_att_0`,
            filename: `document_${i}.pdf`,
            mime: 'application/pdf',
            size: Math.floor(random() * 1000000) + 10000,
          },
        ]
      : [];

    const isUnread = folderType === 'inbox' && random() > 0.4;
    const isStarred = random() > 0.9;

    messages.push({
      id: messageId,
      threadId,
      headers: {
        'Message-ID': `<${messageId}@mock.local>`,
        'Date': date.toISOString(),
      },
      from: sender,
      to: [{ email: userEmail }],
      subject: `${subject} #${i + 1}`,
      date,
      body: {
        text: textBody,
        html: htmlBody,
      },
      attachments,
      flags: {
        unread: isUnread,
        starred: isStarred,
        hasAttachments,
      },
    });
  }

  return messages;
}
