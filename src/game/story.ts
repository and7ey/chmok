import { lateFate } from '../content/late';
import { tenderFate } from '../content/tender';
import { flirtyFate } from '../content/flirty';
import type { FateCard, Mood } from './types';

export { DECK } from '../content/deck';

export const START_COINS = 1000;
export const PASS_START = 200;
export const HOME_BONUS = 60;
export const CURRENCY = 'монет';

export const MOODS: { id: Mood; name: string; tag: string; blurb: string; heat: 1 | 2 | 3 }[] = [
  {
    id: 'tender',
    name: 'Нежность',
    tag: 'тёплый вечер',
    blurb: 'Разговоры, воспоминания и близость без спешки. Для тех, кто заново учится молчать вдвоём.',
    heat: 1,
  },
  {
    id: 'flirty',
    name: 'Флирт',
    tag: 'искры во все стороны',
    blurb: 'Поддразнивание, медленные танцы и «ещё не сейчас». Напряжение, которое держит весь вечер.',
    heat: 2,
  },
  {
    id: 'late',
    name: 'После полуночи',
    tag: '18+',
    blurb: 'Самый смелый набор. Чувственно и откровенно, ровно настолько, насколько вы оба захотите.',
    heat: 3,
  },
];

interface Chapter {
  title: string;
  premise: string;
  aliases: [string, string];
}

const CHAPTER_MAP: Record<Mood, Chapter[]> = {
  tender: [
    {
      title: 'Глава 1. Мы никуда не спешим',
      premise:
        'Вечер только начался. Телефон экраном вниз, свет приглушён, впереди никуда не торопящиеся два часа. Задача простая: снова заметить друг друга.',
      aliases: ['Мечтатель', 'Тихоня'],
    },
    {
      title: 'Глава 2. Дождь за окном',
      premise:
        'Вы уже ближе, чем час назад. Каждое задание теперь стоит чуть больше смелости, а монеты быстро теряют значение.',
      aliases: ['Заводила', 'Хранитель'],
    },
    {
      title: 'Глава 3. Утро без будильника',
      premise:
        'Финальная глава: все начисления двойные. Здесь либо признаются, либо откупаются — третьего не дано.',
      aliases: ['Признательный', 'Бесстрашный'],
    },
  ],
  flirty: [
    {
      title: 'Глава 1. Случайный взгляд',
      premise:
        'Вы встретились и делаете вид, что это случайно. Правила простые: кто первый покраснеет — тот платит.',
      aliases: ['Искушитель', 'Провокатор'],
    },
    {
      title: 'Глава 2. Танец на кухне',
      premise:
        'Дистанция сократилась. Теперь выигрывает тот, кто медленнее сдаётся и дешевле покупает внимание.',
      aliases: ['Дерзкий', 'Медленный'],
    },
    {
      title: 'Глава 3. Полночь',
      premise:
        'Финальная глава с двойными начислениями. Дальше отшучиваться уже не получится.',
      aliases: ['Полуночник', 'Без тормозов'],
    },
  ],
  late: [
    {
      title: 'Глава 1. Свет приглушен',
      premise:
        'Дверь закрыта, мир отложен. Начинаем медленно: только голос, дыхание и обещания, которые собираемся сдержать.',
      aliases: ['Шёпот', 'Тень'],
    },
    {
      title: 'Глава 2. Только мы',
      premise:
        'Половина карты уже сыграна. На кону то, что вы обычно оставляете на потом, — и потом не наступает.',
      aliases: ['Медленный', 'Голодный'],
    },
    {
      title: 'Глава 3. После полуночи',
      premise:
        'Финальная глава: начисления двойные, стеснение — по желанию. Откупиться можно, притвориться, что не хотел, — нет.',
      aliases: ['После полуночи', 'До утра'],
    },
  ],
};

export const chapterAt = (mood: Mood, chapter: number): Chapter =>
  CHAPTER_MAP[mood][Math.max(0, Math.min(2, chapter - 1))];

export const FATE: Record<Mood, FateCard[]> = {
  tender: tenderFate,
  flirty: flirtyFate,
  late: lateFate,
};

export const moodName = (mood: Mood) => MOODS.find((m) => m.id === mood)!.name;
