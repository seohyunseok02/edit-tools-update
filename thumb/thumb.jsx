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

  // 시퀀스: 클립이 가장 많은 시퀀스(본편)를 쓴다
  var seq = null, best = -1, seqs = app.project.sequences;
  for (i = 0; i < seqs.numSequences; i++) { var cnt = 0, vt = seqs[i].videoTracks; for (k = 0; k < vt.numTracks; k++) cnt += vt[k].clips.numItems; if (cnt > best) { best = cnt; seq = seqs[i]; } }
  if (!seq) return finish('이 프로젝트에 시퀀스가 없습니다.');
  app.project.openSequence(seq.sequenceID); app.project.activeSequence = seq;
  say('시퀀스: ' + seq.name);

  var tracks = seq.videoTracks, n = tracks.numTracks;
  // 정면 카메라 트랙: 촬영 영상 파일로 채워진 트랙들 가운데 클립 이름이 A로 시작하는 쪽(A캠). 없으면 가장 위의 촬영 트랙.
  var front = FRONT_TRACK - 1;
  if (front < 0) {
    var cands = [];
    for (i = 0; i < n; i++) {
      var cl = tracks[i].clips, vid = 0, a = 0;
      for (k = 0; k < cl.numItems; k++) { var nm = String(cl[k].name); if (/\.(mp4|mov|mxf|mts|m2ts|avi|braw|r3d)$/i.test(nm)) { vid++; if (/^a/i.test(nm)) a++; } }
      if (cl.numItems >= 5 && vid / cl.numItems > 0.8) cands.push({ i: i, a: a / cl.numItems });
    }
    if (!cands.length) return finish('촬영 영상이 들어 있는 비디오 트랙을 찾지 못했습니다. "정면 카메라 트랙"을 직접 골라 주세요.');
    front = cands[cands.length - 1].i; for (k = 0; k < cands.length; k++) if (cands[k].a > 0.5) front = cands[k].i;
  }
  if (front >= n) return finish('정면트랙 ' + FRONT_TRACK + ' 번이 없습니다. 이 시퀀스의 비디오 트랙은 ' + n + '개입니다.');
  say('정면 카메라 트랙: V' + (front + 1) + (FRONT_TRACK ? ' (직접 지정)' : ' (자동)') + ' · 형식: ' + (pick ? fmt : preset.displayName) + ' · ' + COUNT + '장');

  // 쓸 수 있는 컷: 정면 트랙에서 켜져 있고 촬영 영상이며 1초 이상인 것 (아웃트로 같은 다른 영상은 이름으로 한 번 거른다)
  var clips = tracks[front].clips, good = [], total = 0, names = {}, topName = '', topN = 0;
  for (k = 0; k < clips.numItems; k++) { var nm2 = String(clips[k].name); names[nm2] = (names[nm2] || 0) + 1; if (names[nm2] > topN) { topN = names[nm2]; topName = nm2; } }
  for (k = 0; k < clips.numItems; k++) {
    var c = clips[k], s = c.start.seconds, e = c.end.seconds, cn = String(c.name);
    if (c.disabled || e - s < 1 || !/\.(mp4|mov|mxf|mts|m2ts|avi|braw|r3d)$/i.test(cn)) continue;
    if (names[cn] < 3 && names[cn] < topN / 20) continue; // 한두 번만 나오는 영상(오프닝·아웃트로)은 본 촬영이 아니다
    good.push({ s: s + 0.25, e: e - 0.25, at: total }); total += e - s - 0.5;
  }
  if (!good.length) return finish('V' + (front + 1) + ' 트랙에 캡쳐할 만한 컷이 없습니다.');
  // 영상 앞뒤 4%를 뺀 전체 길이에 고르게 시점을 놓는다 (컷 안에서의 위치도 저절로 달라진다)
  function spread(count) {
    var out = [], g = 0;
    for (i = 0; i < count; i++) { var pos = total * (0.04 + 0.92 * (i + 0.5) / count); while (g < good.length - 1 && good[g + 1].at <= pos) g++; out.push(good[g].s + (pos - good[g].at)); }
    return out;
  }
  var frame = Number(seq.timebase) / 254016000000, muted = [], oldIn = seq.getInPoint(), oldOut = seq.getOutPoint(), made = 0, outDir = null;
  function shot(t, path, presetFile) { seq.setInPoint(t); seq.setOutPoint(t + frame); var r = String(seq.exportAsMediaDirect(new File(path).fsName, presetFile.fsName, app.encoder.ENCODE_IN_TO_OUT)); return new File(path).exists ? '' : r.replace(/\s+/g, ' '); } // fsName: 내보내기는 윈도우식 경로만 받는다
  function restore() { for (i = 0; i < n; i++) if (muted[i] !== undefined) { try { tracks[i].setMute(muted[i] ? 1 : 0); } catch (e1) {} } try { seq.setInPoint(Number(oldIn)); seq.setOutPoint(Number(oldOut)); } catch (e2) {} }
  try {
    for (i = 0; i < n; i++) { muted[i] = tracks[i].isMuted(); tracks[i].setMute(i === front ? 0 : 1); }
    var times = [];
    if (CANDS && cfg['후보폴더'] && cfg['선택파일']) {
      // 1) 후보를 뽑아 프로그램에 넘기고, 프로그램이 고른 시점이 올 때까지 기다린다
      var cdir = new Folder(cfg['후보폴더']), ct = spread(CANDS), list = [], err1 = '';
      for (i = 0; i < ct.length; i++) { var t1 = Math.round(ct[i] / frame) * frame, p1 = cdir.fsName + '/c' + i + '.jpg', r1 = shot(t1, p1, candPreset); if (r1) err1 = r1; else list.push('c' + i + '.jpg|' + t1); }
      if (!list.length) throw new Error('후보 장면을 뽑지 못했습니다: ' + err1);
      writeText(cdir.fsName + '/cands.txt', list.join('\n'));
      var pickFile = new File(cfg['선택파일']), waited = 0;
      while (!pickFile.exists && waited < 900) { $.sleep(500); waited += 0.5; }
      if (!pickFile.exists) throw new Error('프로그램에서 고른 장면이 15분 안에 오지 않았습니다.');
      $.sleep(300); var pl = readText(pickFile.fsName).split(/\r?\n/);
      for (i = 0; i < pl.length; i++) { var pv = parseFloat(pl[i]); if (!isNaN(pv)) times.push(pv); }
      say('후보 ' + list.length + '장 가운데 ' + times.length + '장을 골랐습니다.');
    } else times = spread(COUNT);
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
