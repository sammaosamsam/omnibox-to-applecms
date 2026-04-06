/**
 * AppleCMS V10 标准接口路由
 *
 * 接口格式（与 AppleCMS API 完全兼容）：
 *   ?ac=videolist          → 分类列表（返回 class 和空 list）
 *   ?ac=videolist&t=1      → 按分类 ID 获取列表
 *   ?ac=videolist&pg=2     → 翻页
 *   ?ac=videolist&wd=xxx   → 搜索
 *   ?ac=videolist&ids=x,y  → 按 ID 获取详情
 *
 * 支持两种路径：
 *   /api/vod          → 聚合所有启用的源
 *   /source/:id/api/vod → 单个源
 */
'use strict';

const express = require('express');
const router = express.Router({ mergeParams: true });
const { logger } = require('../logger');
const sourceManager = require('../monitor/sourceManager');
const adapter = require('../adapters/applecmsAdapter');

// ─── 主接口处理器 ──────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { ac, t, pg, wd, ids } = req.query;
    const sourceId = req.params.sourceId || null;
    const page = parseInt(pg, 10) || 1;

    // 获取要使用的引擎列表
    const engines = sourceId
      ? (() => {
          const e = sourceManager.getEngine(sourceId);
          const s = sourceManager.getSource(sourceId);
          return e ? [{ id: sourceId, engine: e, source: s }] : [];
        })()
      : sourceManager.getAllEngines();

    if (engines.length === 0) {
      return res.json(emptyResponse('暂无可用源'));
    }

    // ── ac=videolist&ids=xxx → 详情 ──────────────────────────
    if (ids) {
      return res.json(await handleDetail(engines, ids));
    }

    // ── ac=videolist&wd=xxx → 搜索 ───────────────────────────
    if (wd && wd.trim()) {
      return res.json(await handleSearch(engines, wd.trim(), page));
    }

    // ── ac=videolist&t=xxx → 分类列表 ────────────────────────
    if (t) {
      return res.json(await handleCategory(engines, t, page, req.query));
    }

    // ── ac=videolist (无参数) → 返回分类列表 ─────────────────
    return res.json(await handleClassList(engines));

  } catch (err) {
    logger.error(`路由错误: ${err.message}`);
    res.status(500).json(emptyResponse(`服务器错误: ${err.message}`));
  }
});

// ─── 获取分类列表 ──────────────────────────────────────────────
async function handleClassList(engines) {
  const allClasses = [];

  for (const { id, engine, source } of engines) {
    try {
      const classes = engine.getClasses();
      for (const c of classes) {
        allClasses.push({
          type_id: adapter.encodeTypeId(id, c.type_id),
          type_name: source.name
            ? `[${source.name}] ${c.type_name}`
            : c.type_name,
          type_pid: '0',
        });
      }
    } catch (e) {
      logger.warn(`获取分类失败 [${id}]: ${e.message}`);
    }
  }

  return {
    code: 1,
    msg: '数据列表',
    page: 1,
    pagecount: 1,
    limit: '20',
    total: allClasses.length,
    list: [],
    class: allClasses,
  };
}

// ─── 按分类 ID 获取视频列表 ────────────────────────────────────
async function handleCategory(engines, encodedTypeId, page, query) {
  // 解析 type_id（可能带 sourceId 前缀，也可能是裸 ID）
  const { sourceId, typeId } = adapter.decodeTypeId(encodedTypeId);

  // 筛选引擎
  const targets = sourceId
    ? engines.filter(e => e.id === sourceId)
    : engines;

  if (targets.length === 0) {
    return emptyResponse('未找到对应源');
  }

  const filters = {
    year: query.year || '0',
    area: query.area || '0',
    sort: query.sort || '',
  };

  // 多源聚合
  const allItems = [];
  let maxPageCount = 1;

  for (const { id, engine } of targets) {
    try {
      const result = await engine.callCategory({ typeId, page, filters });
      if (result && result.list) {
        allItems.push(...result.list.map(item => ({ ...item, _sourceId: id })));
        if ((result.pagecount || 1) > maxPageCount) {
          maxPageCount = result.pagecount || 1;
        }
      }
    } catch (e) {
      logger.warn(`分类请求失败 [${id}] typeId=${typeId}: ${e.message}`);
    }
  }

  const list = allItems.map(item => adapter.omniItemToAppleFromModule(item._sourceId, item));

  return {
    code: 1,
    msg: '数据列表',
    page,
    pagecount: maxPageCount,
    limit: '20',
    total: allItems.length,
    list: listItems(allItems),
  };
}

// 统一构建列表（内联）
function listItems(allItems) {
  return allItems.map(item => {
    const sid = item._sourceId;
    return {
      vod_id: adapter.encodeVodId(sid, item.vod_id),
      vod_name: item.vod_name || '',
      vod_pic: item.vod_pic || '',
      vod_remarks: item.vod_remarks || item.vod_note || '',
      vod_year: item.vod_year || '',
      vod_area: item.vod_area || '',
      type_id: item.type_id || '',
      type_name: item.type_name || '',
    };
  });
}

// ─── 搜索 ─────────────────────────────────────────────────────
async function handleSearch(engines, keyword, page) {
  const allItems = [];

  const tasks = engines.map(async ({ id, engine }) => {
    try {
      const result = await engine.callSearch({ keyword, page });
      if (result && result.list) {
        allItems.push(...result.list.map(item => ({ ...item, _sourceId: id })));
      }
    } catch (e) {
      logger.warn(`搜索失败 [${id}] keyword=${keyword}: ${e.message}`);
    }
  });

  await Promise.allSettled(tasks);

  return {
    code: 1,
    msg: '数据列表',
    page,
    pagecount: 1,
    limit: '20',
    total: allItems.length,
    list: listItems(allItems),
  };
}

// ─── 详情（含播放地址）────────────────────────────────────────
async function handleDetail(engines, idsStr) {
  const idList = idsStr.split(',').map(s => s.trim()).filter(Boolean);
  const allItems = [];

  for (const encodedId of idList) {
    const { sourceId, vodId } = adapter.decodeVodId(encodedId);

    // 找到对应引擎
    const targets = sourceId
      ? engines.filter(e => e.id === sourceId)
      : engines;

    for (const { id, engine } of targets) {
      try {
        const result = await engine.callDetail({ ids: vodId });
        if (result && result.list) {
          allItems.push(...result.list.map(item => ({ ...item, _sourceId: id })));
        }
      } catch (e) {
        logger.warn(`详情失败 [${id}] vodId=${vodId}: ${e.message}`);
      }
    }
  }

  const list = allItems.map(item => {
    const sid = item._sourceId;
    const base = {
      vod_id: adapter.encodeVodId(sid, item.vod_id),
      vod_name: item.vod_name || '',
      vod_pic: item.vod_pic || '',
      vod_remarks: item.vod_remarks || item.vod_note || '',
      vod_year: item.vod_year || '',
      vod_area: item.vod_area || '',
      type_id: item.type_id || '',
      type_name: item.type_name || '',
      vod_actor: item.vod_actor || '',
      vod_director: item.vod_director || '',
      vod_content: item.vod_content || item.vod_blurb || '',
    };

    // 播放源转换
    if (item.vod_play_sources && item.vod_play_sources.length > 0) {
      base.vod_play_from = item.vod_play_sources.map(s => s.name || '默认').join('$$$');
      base.vod_play_url = item.vod_play_sources
        .map(s => (s.episodes || []).map(ep => `${ep.name}$${ep.url}`).join('#'))
        .join('$$$');
    } else {
      base.vod_play_from = item.vod_play_from || '默认';
      base.vod_play_url = item.vod_play_url || '';
    }

    return base;
  });

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

function emptyResponse(msg = '') {
  return {
    code: 1,
    msg: msg || '数据列表',
    page: 1,
    pagecount: 0,
    limit: '20',
    total: 0,
    list: [],
    class: [],
  };
}

module.exports = router;
