/**
 * OmniBox → AppleCMS V10 数据格式转换器
 *
 * AppleCMS V10 接口规范：
 *   GET /api.php/provide/vod?ac=videolist&t={tid}&pg={page}&wd={keyword}
 *   GET /api.php/provide/vod?ac=videolist&ids={id1,id2,...}
 *
 * 返回格式：
 * {
 *   "code": 1,
 *   "msg": "数据列表",
 *   "page": 1,
 *   "pagecount": 10,
 *   "limit": "20",
 *   "total": 200,
 *   "list": [ VideoItem... ],
 *   "class": [ ClassItem... ]
 * }
 */
'use strict';

/**
 * 将 OmniBox home 结果转为 AppleCMS 分类列表响应
 */
function homeToAppleCms(homeResult, sourcePrefix) {
  const classes = (homeResult.class || []).map(c => ({
    type_id: `${sourcePrefix}${c.type_id}`,
    type_name: c.type_name,
    type_pid: c.type_pid || '0',
  }));

  return {
    code: 1,
    msg: '数据列表',
    page: 1,
    pagecount: 1,
    limit: '20',
    total: classes.length,
    list: [],
    class: classes,
  };
}

/**
 * 将 OmniBox category/search 结果转为 AppleCMS 列表响应
 * @param {object} result - OmniBox 返回值 { list, page, pagecount }
 * @param {string} sourceId - 源 ID
 * @param {number} page - 当前页
 */
function listToAppleCms(result, sourceId, page) {
  const list = (result.list || []).map(item => omniItemToApple(item, sourceId));
  return {
    code: 1,
    msg: '数据列表',
    page: page || result.page || 1,
    pagecount: result.pagecount || result.total_page || 1,
    limit: '20',
    total: result.total || list.length,
    list,
  };
}

/**
 * 将 OmniBox detail 结果转为 AppleCMS 详情响应
 */
function detailToAppleCms(result, sourceId) {
  const list = (result.list || []).map(item => omniDetailToApple(item, sourceId));
  return {
    code: 1,
    msg: '数据列表',
    page: 1,
    pagecount: 1,
    limit: '20',
    total: list.length,
    list,
  };
}

// ─── 单条视频：列表格式 ────────────────────────────────────────
function omniItemToApple(item, sourceId) {
  return {
    vod_id: encodeVodId(sourceId, item.vod_id),
    vod_name: item.vod_name || '',
    vod_pic: item.vod_pic || '',
    vod_remarks: item.vod_remarks || item.vod_note || '',
    vod_year: item.vod_year || '',
    vod_area: item.vod_area || '',
    type_id: item.type_id || '',
    type_name: item.type_name || '',
  };
}

// 别名：与路由调用保持一致
function omniItemToAppleFromModule(sourceId, item) {
  return omniItemToApple(item, sourceId);
}

// ─── 单条视频：详情格式（含播放源）────────────────────────────
function omniDetailToApple(item, sourceId) {
  const base = omniItemToApple(item, sourceId);

  // 构建播放列表：AppleCMS 格式
  // vod_play_from: "线路1$$$线路2"
  // vod_play_url:  "ep01$url1#ep02$url2$$$ep01$url1#ep02$url2"
  let playFrom = '';
  let playUrl = '';

  if (item.vod_play_sources && item.vod_play_sources.length > 0) {
    const froms = [];
    const urls = [];
    for (const source of item.vod_play_sources) {
      froms.push(source.name || '线路1');
      //瓜子APP使用 playId 而不是 url
      const epStr = (source.episodes || []).map(ep => `${ep.name}$${ep.url || ep.playId || ''}`).join('#');
      urls.push(epStr);
    }
    playFrom = froms.join('$$$');
    playUrl = urls.join('$$$');
  } else if (item.vod_play_url) {
    // 已经是字符串格式
    playFrom = item.vod_play_from || '默认线路';
    playUrl = item.vod_play_url;
  }

  return {
    ...base,
    vod_actor: item.vod_actor || '',
    vod_director: item.vod_director || '',
    vod_content: item.vod_content || item.vod_blurb || '',
    vod_type: item.vod_class || item.type_name || '',
    vod_lang: item.vod_lang || '',
    vod_play_from: playFrom,
    vod_play_url: playUrl,
  };
}

// ─── ID 编解码（携带 sourceId 前缀） ──────────────────────────
function encodeVodId(sourceId, vodId) {
  // 格式：srcId__vodId
  return `${sourceId}__${vodId}`;
}

function decodeVodId(encodedId) {
  const idx = encodedId.indexOf('__');
  if (idx === -1) return { sourceId: null, vodId: encodedId };
  return {
    sourceId: encodedId.slice(0, idx),
    vodId: encodedId.slice(idx + 2),
  };
}

// ─── 分类 ID 编解码 ─────────────────────────────────────────
function encodeTypeId(sourceId, typeId) {
  return `${sourceId}::${typeId}`;
}

function decodeTypeId(encodedTypeId) {
  const idx = encodedTypeId.indexOf('::');
  if (idx === -1) return { sourceId: null, typeId: encodedTypeId };
  return {
    sourceId: encodedTypeId.slice(0, idx),
    typeId: encodedTypeId.slice(idx + 2),
  };
}

module.exports = {
  homeToAppleCms,
  listToAppleCms,
  detailToAppleCms,
  omniItemToApple,
  omniItemToAppleFromModule,
  omniDetailToApple,
  encodeVodId,
  decodeVodId,
  encodeTypeId,
  decodeTypeId,
};
