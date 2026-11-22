/**
 * 漫画风格预设。
 *
 * 用户只说一句「一只猫在打架」，Agent 也能有个靠谱的画风默认值。
 * style 片段会拼进提示词的「风格」栏，negative 片段会合并进「负向提示词」栏。
 */

export const COMIC_STYLES = [
  {
    key: "jp-cel",
    label: "日漫 · 赛璐璐",
    style: "日系漫画赛璐璐上色，干净利落的黑色线稿，网点阴影，高饱和但克制的配色",
    negative: "写实照片，3D 渲染，油画笔触，水彩晕染，模糊线条",
    aspect: "9:16"
  },
  {
    key: "jp-shonen",
    label: "日漫 · 少年热血",
    style: "少年漫画风格，夸张的动态姿态，速度线与冲击特效，高对比硬阴影",
    negative: "写实照片，柔和光线，静态构图",
    aspect: "9:16"
  },
  {
    key: "jp-shoujo",
    label: "日漫 · 少女漫画",
    style: "少女漫画柔和水彩色，细腻线条，花瓣与闪光点缀，柔和粉紫光",
    negative: "写实照片，厚重阴影，暴力元素",
    aspect: "9:16"
  },
  {
    key: "us-comic",
    label: "美漫 · 超级英雄",
    style: "美式超级英雄漫画，粗重墨线与网点上色，高对比戏剧光，动态透视",
    negative: "水彩，柔焦，照片感，低对比",
    aspect: "3:2"
  },
  {
    key: "us-ink",
    label: "美漫 · 黑白墨线",
    style: "黑白漫画墨线风格，钢笔勾线，排线阴影，强烈黑白对比",
    negative: "彩色，油画，水彩，柔和渐变",
    aspect: "3:2"
  },
  {
    key: "cn-xianxia",
    label: "国漫 · 仙侠古风",
    style: "国产仙侠漫画风格，工笔线描配青绿山水设色，飘带流云，留白讲究",
    negative: "现代都市，现代服饰，机械元素",
    aspect: "2:3"
  },
  {
    key: "cn-guofeng",
    label: "国漫 · 都市古风",
    style: "国风漫画，厚涂质感与细腻线稿结合，朱砂红与墨黑主色，暗纹装饰",
    negative: "赛璐璐，欧美卡通，粗糙线稿",
    aspect: "2:3"
  },
  {
    key: "hk-comic",
    label: "港漫 · 写实硬派",
    style: "港漫写实画风，厚重阴影与高光，油画笔触渲染肌肉与布料质感",
    negative: "可爱风，Q版，简洁线稿",
    aspect: "3:2"
  },
  {
    key: "ink-wash",
    label: "水墨 · 淡彩",
    style: "中国水墨淡彩，宣纸质感，墨色浓淡与飞白，留白写意",
    negative: "厚涂，赛璐璐，鲜艳饱和色，照片",
    aspect: "2:3"
  },
  {
    key: "manhua-bw",
    label: "条漫 · 黑白分镜",
    style: "黑白条漫分镜风格，粗细变化明显的墨线，大面积黑块与留白构成的戏剧张力",
    negative: "彩色，渐变，水彩，柔和",
    aspect: "9:16"
  },
  {
    key: "cyber-comic",
    label: "赛博 · 霓虹漫画",
    style: "赛博朋克漫画风，霓虹冷蓝与洋红补光，雨夜反光质感，机械义体细节",
    negative: "田园，古风，白天明亮自然光",
    aspect: "16:9"
  },
  {
    key: "pixel",
    label: "像素 · 复古游戏",
    style: "16bit 像素艺术，规整像素网格，限制色板，街机游戏画面",
    negative: "写实，光滑渐变，高分辨率细节",
    aspect: "1:1"
  }
];

/** 按 key 取预设 */
export function getStyle(key) {
  return COMIC_STYLES.find((s) => s.key === key) || null;
}
