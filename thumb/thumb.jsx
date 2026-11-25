/* 썸네일 캡쳐: 프로젝트에서 정면 카메라 화면만 남기고(자막·효과자막·인서트·다른 카메라 트랙은 잠시 숨김) 프리미어의 내보내기로 스틸을 뽑는다.
   "편집 도구 모음" 프로그램의 썸네일 탭이 job.txt 로 설정을 넘겨 실행한다. 두 단계로 일한다:
   1) 후보 장면을 넉넉히 작은 그림(JPEG)으로 뽑아 프로그램에 넘긴다 → 프로그램이 얼굴·표정을 보고 고른다
   2) 프로그램이 고른 시점만 정해진 형식(PNG 16bit 등)으로 뽑는다
   끝나면 숨겼던 트랙과 인·아웃 표시를 원래대로 돌려 놓고, 프로젝트는 저장하지 않는다. */
(function () {
  var here = new File($.fileName).parent.fsName, log = [];
  function readText(path) { var f = new File(path); if (!f.exists) return ''; f.encoding = 'UTF-8'; f.open('r'); var s = f.read(); f.close(); return s; }
  function writeText(path, s) { var f = new File(path); f.encoding = 'UTF-8'; f.open('w'); f.write(s); f.close(); }
  // "이름 = 값" 한 줄씩
  var jobFile = new File(here + '/job.txt'), job = readText(jobFile.fsName), cfg = {}, lines = job.split(/\r?\n/), i, k;
  if (job) jobFile.remove();
  for (i = 0; i < lines.length; i++) { var m = /^\s*([^=#]+?)\s*=\s*(.*?)\s*$/.exec(lines[i]); if (m) cfg[m[1]] = m[2]; }
  var resultFile = cfg['결과파일'] || (here + '/result.txt');
  function say(s) { log.push(s); }
  function finish(msg, outDir) { say(msg); writeText(resultFile, (outDir ? '폴더=' + outDir + '\n' : '') + log.join('\n')); }
  if (!job) { alert('이 스크립트는 "편집 도구 모음" 프로그램의 썸네일 캡쳐 탭에서 실행됩니다.'); return; }

  var FORMATS = { png16: ['png16.epr', 'png'], png8: ['png8.epr', 'png'], tiff16: ['tiff16.epr', 'tif'], tiff8: ['tiff8.epr', 'tif'], jpg: ['jpg.epr', 'jpg'] };
  var fmt = String(cfg['형식'] || 'png16'), pick = FORMATS[fmt.toLowerCase()], ext = pick ? pick[1] : String(cfg['확장자'] || '').replace(/^\./, '');
  var preset = pick ? new File(here + '/' + pick[0]) : new File(fmt), candPreset = new File(here + '/jpg.epr');
  var COUNT = Math.max(1, Math.min(60, parseInt(cfg['장수'], 10) || 7)), FRONT_TRACK = parseInt(cfg['정면트랙'], 10) || 0, CANDS = Math.max(0, Math.min(90, parseInt(cfg['후보수'], 10) || 0));
  if (!preset.exists) return finish('형식 "' + fmt + '" 에 해당하는 사전 설정 파일을 찾지 못했습니다.');
  if (!ext) return finish('직접 만든 사전 설정을 쓸 때는 파일 확장자(png, tif, jpg, dpx, exr 등)를 적어 주세요.');

  var projFile = cfg['프로젝트'] ? new File(cfg['프로젝트']) : null;
  if (!projFile || !projFile.exists) return finish('프로젝트 파일을 찾지 못해 끝냅니다.');
  app.openDocument(projFile.fsName, true, true, true);
  if (!app.project || !app.project.path) return finish('프로젝트를 열지 못했습니다: ' + projFile.fsName);

  var seqs = app.project.sequences;
  // 디자인 미리보기 모드(효과자막 탭): 확장자 칸에 "design:시퀀스이름;초@트랙,트랙;…" 이 온다. 시점마다 그 디자인의 트랙과 그 아래(배경)만 보이게 하고 JPEG 한 장씩 뽑는다.
  var DESIGN = /^design:/.test(String(cfg['확장자'] || '')) ? String(cfg['확장자']).slice(7).split(';') : null;
  if (DESIGN) {
    var want = decodeURIComponent(DESIGN[0]), dseq = null;
    for (i = 0; i < seqs.numSequences; i++) if (seqs[i].name === want) dseq = seqs[i];
    if (!dseq) return finish('템플릿에서 "' + want + '" 시퀀스를 찾지 못했습니다.');
    app.project.openSequence(dseq.sequenceID); app.project.activeSequence = dseq;
    var dtr = dseq.videoTracks, dn = dtr.numTracks, dm = [], dfr = Number(dseq.timebase) / 254016000000, oi = dseq.getInPoint(), oo = dseq.getOutPoint(), dl = [], derr = '', cdir2 = new Folder(cfg['후보폴더']);
    for (i = 0; i < dn; i++) dm[i] = dtr[i].isMuted();
    try {
      for (k = 1; k < DESIGN.length; k++) {
        var parts = DESIGN[k].split('@'), tt = Math.round(parseFloat(parts[0]) / dfr) * dfr, keep = String(parts[1] || '').split(','), lo = 999, j;
        for (j = 0; j < keep.length; j++) lo = Math.min(lo, parseInt(keep[j], 10));
        for (j = 0; j < dn; j++) { var show = j < lo, q; for (q = 0; q < keep.length; q++) if (parseInt(keep[q], 10) === j) show = true; dtr[j].setMute(show ? 0 : 1); }
        dseq.setInPoint(tt); dseq.setOutPoint(tt + dfr);
        var pth = cdir2.fsName + '/c' + (k - 1) + '.jpg', rr = String(dseq.exportAsMediaDirect(new File(pth).fsName, candPreset.fsName, app.encoder.ENCODE_IN_TO_OUT));
        if (new File(pth).exists) dl.push('c' + (k - 1) + '.jpg|' + tt); else derr = rr;
      }
    } catch (de) { derr = String(de.message || de); }
    for (i = 0; i < dn; i++) { try { dtr[i].setMute(dm[i] ? 1 : 0); } catch (e3) {} }
    try { dseq.setInPoint(Number(oi)); dseq.setOutPoint(Number(oo)); } catch (e4) {}
    if (dl.length) writeText(cdir2.fsName + '/cands.txt', dl.join('\n'));
    return finish('디자인 미리보기 ' + dl.length + '장을 뽑았습니다.' + (derr ? ' (실패: ' + derr + ')' : ''));
  }
  // 시퀀스: 클립이 가장 많은 시퀀스(본편)를 쓴다
  var seq = null, best = -1;
  for (i = 0; i < seqs.numSequences; i++) { var cnt = 0, vt = seqs[i].videoTracks; for (k = 0; k < vt.numTracks; k++) cnt += vt[k].clips.numItems; if (cnt > best) { best = cnt; seq = seqs[i]; } }
  if (!seq) return finish('이 프로젝트에 시퀀스가 없습니다.');
  app.project.openSequence(seq.sequenceID); app.project.activeSequence = seq;
  say('시퀀스: ' + seq.name);

  var tracks = seq.videoTracks, n = tracks.numTracks;
  // 정면 카메라 트랙: 촬영 영상 파일로 채워진 트랙들 가운데 클립 이름이 A로 시작하는 쪽(A캠). 없으면 가장 위의 촬영 트랙.
  var front = FRONT_TRACK - 1, camTracks = [], TOFF = 100000; // 후보 시점에 (카메라 번호 × TOFF)를 더해 어느 트랙 장면인지 함께 넘긴다

  if (front < 0) {
    // 템플릿 소재(@로 시작·transition·intro·ending·preview)는 촬영 영상이 아니다. 촬영 트랙은 영상 대부분을 덮으므로 가장 길게 덮는 트랙의 40% 이상인 것만 후보
    var cands = [], maxSec = 0;
    for (i = 0; i < n; i++) {
      var cl = tracks[i].clips, vid = 0, a = 0, sec = 0;
      for (k = 0; k < cl.numItems; k++) { var nm = String(cl[k].name); if (/\.(mp4|mov|mxf|mts|m2ts|avi|braw|r3d)$/i.test(nm) && !/^@|transition|intro|ending|preview/i.test(nm)) { vid++; sec += cl[k].end.seconds - cl[k].start.seconds; if (/^a/i.test(nm)) a++; } }
      if (cl.numItems >= 5 && vid / cl.numItems > 0.8) { cands.push({ i: i, a: a / cl.numItems, sec: sec }); if (sec > maxSec) maxSec = sec; }
    }
    var big = []; for (k = 0; k < cands.length; k++) if (cands[k].sec >= maxSec * 0.4) big.push(cands[k]); cands = big;
    if (!cands.length) return finish('촬영 영상이 들어 있는 비디오 트랙을 찾지 못했습니다. "정면 카메라 트랙"을 직접 골라 주세요.');
    front = cands[cands.length - 1].i; for (k = 0; k < cands.length; k++) if (cands[k].a > 0.5) front = cands[k].i;
    // 카메라 트랙이 여럿이면(A캠 이름이 없을 때) 프로그램이 얼굴을 보고 정면캠을 고른다: 위쪽부터 최대 3개를 후보로 넘긴다
    var anyA = false; for (k = 0; k < cands.length; k++) if (cands[k].a > 0.5) anyA = true;
    if (!anyA && cands.length > 1) for (k = cands.length - 1; k >= 0 && camTracks.length < 3; k--) camTracks.push(cands[k].i);
  }
  if (front >= n) return finish('정면트랙 ' + FRONT_TRACK + ' 번이 없습니다. 이 시퀀스의 비디오 트랙은 ' + n + '개입니다.');
  var MULTI = camTracks.length > 1 && CANDS && cfg['후보폴더'] && cfg['선택파일'];
  var tl = []; for (k = 0; k < camTracks.length; k++) tl.push('V' + (camTracks[k] + 1));
  say('정면 카메라 트랙: ' + (MULTI ? tl.join('·') + ' 가운데 얼굴을 보고 고름' : 'V' + (front + 1) + (FRONT_TRACK ? ' (직접 지정)' : ' (자동)')) + ' · 형식: ' + (pick ? fmt : preset.displayName) + ' · ' + COUNT + '장');

  // 쓸 수 있는 컷: 그 트랙에서 켜져 있고 촬영 영상이며 1초 이상인 것 (아웃트로 같은 다른 영상은 이름으로 한 번 거른다)
  function cutsOf(ti) {
    var clips = tracks[ti].clips, good = [], total = 0, names = {}, topN = 0;
    for (k = 0; k < clips.numItems; k++) { var nm2 = String(clips[k].name); names[nm2] = (names[nm2] || 0) + 1; if (names[nm2] > topN) topN = names[nm2]; }
    for (k = 0; k < clips.numItems; k++) {
      var c = clips[k], s = c.start.seconds, e = c.end.seconds, cn = String(c.name);
      if (c.disabled || e - s < 1 || !/\.(mp4|mov|mxf|mts|m2ts|avi|braw|r3d)$/i.test(cn) || /^@|transition|intro|ending|preview/i.test(cn)) continue;
      if (names[cn] < 3 && names[cn] < topN / 20) continue; // 한두 번만 나오는 영상(오프닝·아웃트로)은 본 촬영이 아니다
      good.push({ s: s + 0.25, e: e - 0.25, at: total }); total += e - s - 0.5;
    }
    return { good: good, total: total };
  }
  // 영상 앞뒤 4%를 뺀 전체 길이에 고르게 시점을 놓는다 (컷 안에서의 위치도 저절로 달라진다)
  function spread(count, cu) {
    var out = [], g = 0, good = cu.good, total = cu.total;
    for (i = 0; i < count; i++) { var pos = total * (0.04 + 0.92 * (i + 0.5) / count); while (g < good.length - 1 && good[g + 1].at <= pos) g++; out.push(good[g].s + (pos - good[g].at)); }
    return out;
  }
  var cuts = cutsOf(front);
  if (!cuts.good.length) return finish('V' + (front + 1) + ' 트랙에 캡쳐할 만한 컷이 없습니다.');
  var frame = Number(seq.timebase) / 254016000000, muted = [], oldIn = seq.getInPoint(), oldOut = seq.getOutPoint(), made = 0, outDir = null;
  function shot(t, path, presetFile) { seq.setInPoint(t); seq.setOutPoint(t + frame); var r = String(seq.exportAsMediaDirect(new File(path).fsName, presetFile.fsName, app.encoder.ENCODE_IN_TO_OUT)); return new File(path).exists ? '' : r.replace(/\s+/g, ' '); } // fsName: 내보내기는 윈도우식 경로만 받는다
  function restore() { for (i = 0; i < n; i++) if (muted[i] !== undefined) { try { tracks[i].setMute(muted[i] ? 1 : 0); } catch (e1) {} } try { seq.setInPoint(Number(oldIn)); seq.setOutPoint(Number(oldOut)); } catch (e2) {} }
  function solo(ti) { for (var q = 0; q < n; q++) tracks[q].setMute(q === ti ? 0 : 1); }
  try {
    for (i = 0; i < n; i++) muted[i] = tracks[i].isMuted();
    solo(front);
    var times = [];
    if (CANDS && cfg['후보폴더'] && cfg['선택파일']) {
      // 1) 후보를 뽑아 프로그램에 넘기고, 프로그램이 고른 시점이 올 때까지 기다린다. 카메라가 여럿이면 트랙마다 뽑고 시점에 (번호 × TOFF)를 더해 넘긴다
      var cdir = new Folder(cfg['후보폴더']), list = [], err1 = '', cams = MULTI ? camTracks : [front], per = MULTI ? Math.max(30, Math.ceil(CANDS * 0.7)) : CANDS, ci = 0, gi;
      for (gi = 0; gi < cams.length; gi++) {
        var cu = cutsOf(cams[gi]); if (!cu.good.length) continue; solo(cams[gi]); var ct = spread(per, cu);
        for (i = 0; i < ct.length; i++) { var t1 = Math.round(ct[i] / frame) * frame, p1 = cdir.fsName + '/c' + ci + '.jpg', r1 = shot(t1, p1, candPreset); if (r1) err1 = r1; else list.push('c' + ci + '.jpg|' + (t1 + gi * TOFF)); ci++; }
      }
      if (!list.length) throw new Error('후보 장면을 뽑지 못했습니다: ' + err1);
      writeText(cdir.fsName + '/cands.txt', list.join('\n'));
      var pickFile = new File(cfg['선택파일']), waited = 0;
      while (!pickFile.exists && waited < 900) { $.sleep(500); waited += 0.5; }
      if (!pickFile.exists) throw new Error('프로그램에서 고른 장면이 15분 안에 오지 않았습니다.');
      $.sleep(300); var pl = readText(pickFile.fsName).split(/\r?\n/), vote = {};
      for (i = 0; i < pl.length; i++) { var pv = parseFloat(pl[i]); if (!isNaN(pv)) { var gv = Math.floor(pv / TOFF); vote[gv] = (vote[gv] || 0) + 1; times.push(pv - gv * TOFF); } }
      if (MULTI) { var bg = 0, bn = -1; for (var vk in vote) if (vote[vk] > bn) { bn = vote[vk]; bg = parseInt(vk, 10); } front = cams[Math.min(bg, cams.length - 1)]; solo(front); say('정면 카메라로 V' + (front + 1) + ' 을 골랐습니다 (얼굴이 정면을 보는 장면이 가장 많은 트랙).'); }
      say('후보 ' + list.length + '장 가운데 ' + times.length + '장을 골랐습니다.');
    } else times = spread(COUNT, cuts);
    // 2) 고른 시점을 정해진 형식으로 뽑는다
    var base = cfg['저장폴더'] ? new Folder(cfg['저장폴더']) : projFile.parent;
    if (!base.exists) throw new Error('저장 위치로 정한 폴더를 찾지 못했습니다: ' + cfg['저장폴더']);
    outDir = new Folder(base.fsName + '/썸네일_' + String(projFile.displayName).replace(/\.prproj$/i, ''));
    if (!outDir.exists && !outDir.create()) throw new Error('저장 폴더를 만들지 못했습니다: ' + outDir.fsName);
    times.sort(function (x, y) { return x - y; });
    for (i = 0; i < times.length; i++) {
      var t = Math.round(times[i] / frame) * frame, mm = Math.floor(t / 60), ss = Math.floor(t - mm * 60), stamp = mm + '분' + (ss < 10 ? '0' : '') + ss + '초';
      var out = new File(outDir.fsName + '/썸네일_' + (i + 1 < 10 ? '0' : '') + (i + 1) + '_' + stamp + '.' + ext).fsName, r = shot(t, out, preset);
      say(r ? '실패 ' + stamp + ': ' + r : '저장=' + out); if (!r) made++;
    }
  } catch (err) { say('오류: ' + (err.message || err)); }
  restore();
  finish('썸네일 ' + made + '장을 뽑았습니다.' + (outDir ? '\n저장 위치: ' + outDir.fsName : ''), outDir ? outDir.fsName : '');
})();
