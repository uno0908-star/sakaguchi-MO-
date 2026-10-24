/* ls-guard.js — スマホの保存領域（localStorage）満杯対策（全アプリ共通）
 *
 * uno0908-star.github.io 配下のアプリは保存領域（iPhoneで約5MB）を共有している。
 * どこかのアプリのキャッシュで満杯になると、別アプリの保存が
 * 「The quota has been exceeded」で失敗し、送信エラー等に見えてしまう（2026-10-24 シフト希望で発生）。
 *
 * 対策：保存が満杯で失敗したら「GASから取り直せるキャッシュ」だけを消して1回だけ再挑戦する。
 *   ・未送信データを持つキー（se_*：個店カルテの未同期分 など）は絶対に消さない
 *   ・それでも入らない時は従来どおりエラーを投げる（各アプリの既存の処理に任せる）
 * 使い方：<head> の先頭付近に <script src="ls-guard.js"></script> を置くだけ。
 */
(function () {
  // 消してよいキャッシュ（次に開いた時にGASから取り直せるもの）。大きい順に消す
  var EVICTABLE = [
    'shiftData', 'shiftConfirmed',          // シフト希望
    'karte_v1',                              // 個店カルテ（カルテ表示キャッシュ）
    'tng_cache',                             // 棚替え報告
    'lbd_cache_v1',                          // 店利益ダッシュボード
    'msCleaningCache_v3',                    // MS清掃
    'todoTasksCache_v1',                     // タスク管理
    'creedAdmin_cache_v1',                   // 理念アプリ管理
    'compCache'                              // コンプラ提出状況
  ];
  try {
    var proto = Storage.prototype;
    if (proto.__lsGuard) return;
    var orig = proto.setItem;
    var isQuota = function (e) {
      return e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
                   e.code === 22 || e.code === 1014 || /quota/i.test(String(e.message || '')));
    };
    proto.setItem = function (key, value) {
      try { return orig.call(this, key, value); } catch (e) {
        if (!isQuota(e) || this !== window.localStorage) throw e;
        var self = this;
        var keys = EVICTABLE.filter(function (k) { return k !== key && self.getItem(k) !== null; })
          .sort(function (a, b) { return (self.getItem(b) || '').length - (self.getItem(a) || '').length; });
        for (var i = 0; i < keys.length; i++) {
          self.removeItem(keys[i]);
          try { var r = orig.call(self, key, value); console.warn('[ls-guard] 容量確保のためキャッシュを削除:', keys.slice(0, i + 1)); return r; } catch (e2) {}
        }
        // 自分自身の古い値を消してからもう一度（同じキーの上書きで一時的に2倍必要なため）
        //   入らなければ古い値を戻す（データを失わない）
        var old = self.getItem(key);
        if (old !== null) {
          self.removeItem(key);
          try { return orig.call(self, key, value); } catch (e3) { try { orig.call(self, key, old); } catch (e4) {} }
        }
        throw e;
      }
    };
    proto.__lsGuard = true;
  } catch (e) { /* 古いブラウザ等では何もしない */ }
})();
