import {produceToLook, type LookRecipe} from './lookPacks';
import type {ProduceOptions} from '../types';

const KEY = 'koubo.lookPacks';

export function loadSavedLooks(): LookRecipe[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LookRecipe[];
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.id && item.name) : [];
  } catch {
    return [];
  }
}

function write(items: LookRecipe[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function saveCurrentLook(options: ProduceOptions, name: string) {
  const items = loadSavedLooks();
  const id = `user_${Date.now().toString(36)}`;
  const next = [produceToLook(options, name, id), ...items].slice(0, 24);
  write(next);
  return next[0];
}

export function deleteSavedLook(id: string) {
  const next = loadSavedLooks().filter((item) => item.id !== id);
  write(next);
  return next;
}
