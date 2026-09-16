export const REWRITE_GENRES = [
  {id: 'knowledge', name: '知识科普'},
  {id: 'product', name: '产品介绍'},
  {id: 'opinion', name: '个人观点'},
  {id: 'news', name: '新闻资讯'},
  {id: 'tutorial', name: '教程教学'},
  {id: 'story', name: '故事分享'},
  {id: 'experience', name: '经验总结'},
  {id: 'emotion', name: '情绪/情感'},
  {id: 'marketing', name: '商业营销'},
  {id: 'travel', name: '探店/旅行'},
  {id: 'personal_ip', name: '个人IP'},
  {id: 'industry', name: '行业分析'},
] as const;

export const REWRITE_PLATFORMS = [
  {id: 'douyin', name: '抖音'},
  {id: 'xiaohongshu', name: '小红书'},
  {id: 'weixin', name: '视频号'},
  {id: 'bilibili', name: 'B站'},
  {id: 'youtube_shorts', name: 'YouTube Shorts'},
  {id: 'instagram_reels', name: 'Instagram Reels'},
  {id: 'tiktok', name: 'TikTok'},
  {id: 'linkedin', name: 'LinkedIn'},
] as const;

export type RewriteGenre = (typeof REWRITE_GENRES)[number]['id'];
export type RewritePlatform = (typeof REWRITE_PLATFORMS)[number]['id'];

export type RewriteOptions = {
  genre: RewriteGenre;
  platform: RewritePlatform;
};

export const DEFAULT_REWRITE: RewriteOptions = {
  genre: 'knowledge',
  platform: 'douyin',
};

export function genreName(id?: string) {
  return REWRITE_GENRES.find((item) => item.id === id)?.name || '';
}

export function platformName(id?: string) {
  return REWRITE_PLATFORMS.find((item) => item.id === id)?.name || '';
}
