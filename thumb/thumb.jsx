/* 썸네일 캡쳐: 프로젝트에서 정면 카메라 화면만 남기고(자막·효과자막·인서트·다른 카메라 트랙은 잠시 숨김)
   프리미어의 내보내기로 스틸을 여러 장 뽑는다. 끝나면 숨겼던 트랙과 인·아웃 표시를 원래대로 돌려 놓고, 프로젝트는 저장하지 않는다.
   실행 방법 두 가지:
   - "편집 도구 모음" 프로그램의 썸네일 탭 (job.txt 로 설정과 프로젝트를 넘겨받는다)
   - 프리미어를 끈 상태에서 "썸네일 캡쳐.bat" 더블클릭 (설정.txt 를 읽고, 프로젝트는 창에서 고른다) */
(function () {
  var here = new File($.fileName).parent.fsName, log = [];
  function readText(path) { var f = new File(path); if (!f.exists) return ''; f.encoding = 'UTF-8'; f.open('r'); var s = f.read(); f.close(); return s; }
  function writeText(path, s) { var f = new File(path); f.encoding = 'UTF-8'; f.open('w'); f.write(s); f.close(); }
  // "이름 = 값" 한 줄씩. # 으로 시작하는 줄은 설명이다.
  var jobFile = new File(here + '/job.txt'), job = readText(jobFile.fsName), cfg = {}, lines = (job || readText(here + '/설정.txt')).split(/\r?\n/), i, k;
  if (job) jobFile.remove(); // 한 번 쓰고 지운다: 다음에 bat 로 실행하면 직접 고르는 방식이 된다
  for (i = 0; i < lines.length; i++) { var m = /^\s*([^=#]+?)\s*=\s*(.*?)\s*$/.exec(lines[i]); if (m) cfg[m[1]] = m[2]; }
  var silent = !!job, resultFile = cfg['결과파일'] || '';
  function say(s) { log.push(s); }
  function finish(msg, outDir) {
    say(msg); writeText(resultFile || ((outDir || here) + '/result.txt'), (outDir ? '폴더=' + outDir + '\n' : '') + log.join('\n'));
    if (!silent) alert(msg);
  }
  var FORMATS = { png16: ['png16.epr', 'png'], png8: ['png8.epr', 'png'], tiff16: ['tiff16.epr', 'tif'], tiff8: ['tiff8.epr', 'tif'], jpg: ['jpg.epr', 'jpg'] };
  var fmt = String(cfg['형식'] || 'png16'), pick = FORMATS[fmt.toLowerCase()], ext = pick ? pick[1] : String(cfg['확장자'] || '').replace(/^\./, '');
  var preset = pick ? new File(here + '/' + pick[0]) : new File(fmt); if (!pick && !preset.exists) preset = new File(here + '/' + fmt);
  var COUNT = Math.max(1, Math.min(60, parseInt(cfg['장수'], 10) || 7)), FRONT_TRACK = parseInt(cfg['정면트랙'], 10) || 0;
  if (!preset.exists) return finish('형식 "' + fmt + '" 에 해당하는 사전 설정 파일을 찾지 못했습니다.\n쓸 수 있는 값: png16, png8, tiff16, tiff8, jpg, 또는 직접 저장한 .epr 파일');
  if (!ext) return finish('직접 만든 사전 설정을 쓸 때는 파일 확장자(png, tif, jpg, dpx, exr 등)를 적어 주세요.');

  var projFile = cfg['프로젝트'] ? new File(cfg['프로젝트']) : (silent ? null : File.openDialog('썸네일을 뽑을 프리미어 프로젝트를 고르세요', 'Premiere Pro:*.prproj'));
  if (!projFile || !projFile.exists) return finish('프로젝트를 고르지 않았거나 찾지 못해 끝냅니다.');
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
    if (!cands.length) return finish('촬영 영상이 들어 있는 비디오 트랙을 찾지 못했습니다. "정면트랙" 에 정면 카메라 트랙 번호(V1이면 1)를 적어 주세요.');
    front = cands[cands.length - 1].i; for (k = 0; k < cands.length; k++) if (cands[k].a > 0.5) front = cands[k].i;
  }
  if (front >= n) return finish('정면트랙 ' + FRONT_TRACK + ' 번이 없습니다. 이 시퀀스의 비디오 트랙은 ' + n + '개입니다.');
  say('정면 카메라 트랙: V' + (front + 1) + (FRONT_TRACK ? ' (직접 지정)' : ' (자동)') + ' · 형식: ' + (pick ? fmt : preset.displayName) + ' · ' + COUNT + '장');

  // 캡쳐할 시점: 정면 트랙에서 켜져 있고 1.5초 이상인 컷들 가운데, 영상 앞뒤 5%를 뺀 구간에서 고르게
  var clips = tracks[front].clips, good = [];
  for (k = 0; k < clips.numItems; k++) { var c = clips[k], s = c.start.seconds, e = c.end.seconds; if (!c.disabled && e - s >= 1.5) good.push({ s: s, e: e }); }
  if (!good.length) return finish('V' + (front + 1) + ' 트랙에 캡쳐할 만한 컷이 없습니다.');
  var t0 = good[0].s, span = good[good.length - 1].e - t0, times = [], used = {};
  for (i = 0; i < COUNT; i++) {
    var want = t0 + span * (0.05 + 0.9 * (i + 0.5) / COUNT), bi = -1, bd = 1e12;
    for (k = 0; k < good.length; k++) { if (used[k]) continue; var d = Math.abs((good[k].s + good[k].e) / 2 - want); if (d < bd) { bd = d; bi = k; } }
    if (bi < 0) break; used[bi] = true; times.push((good[bi].s + good[bi].e) / 2);
  }
  times.sort(function (x, y) { return x - y; });

  // 저장 위치: 지정한 폴더(없으면 프로젝트 옆) 안에 프로젝트 이름으로 폴더를 만든다. 여러 프로젝트를 한곳에 모아도 섞이거나 덮어쓰지 않는다.
  var base = cfg['저장폴더'] ? new Folder(cfg['저장폴더']) : projFile.parent;
  if (!base.exists) return finish('저장 위치로 정한 폴더를 찾지 못했습니다: ' + cfg['저장폴더']);
  var outDir = new Folder(base.fsName + '/썸네일_' + String(projFile.displayName).replace(/\.prproj$/i, ''));
  if (!outDir.exists && !outDir.create()) return finish('저장 폴더를 만들지 못했습니다: ' + outDir.fsName);
  var frame = Number(seq.timebase) / 254016000000, made = 0, muted = [], oldIn = seq.getInPoint(), oldOut = seq.getOutPoint();
  try {
    for (i = 0; i < n; i++) { muted[i] = tracks[i].isMuted(); tracks[i].setMute(i === front ? 0 : 1); }
    for (i = 0; i < times.length; i++) {
      var t = Math.round(times[i] / frame) * frame, mm = Math.floor(t / 60), ss = Math.floor(t - mm * 60), stamp = mm + '분' + (ss < 10 ? '0' : '') + ss + '초';
      var out = new File(outDir.fsName + '/썸네일_' + (i + 1 < 10 ? '0' : '') + (i + 1) + '_' + stamp + '.' + ext).fsName; // fsName: 프리미어 내보내기는 윈도우식 경로(역슬래시)만 받는다
      seq.setInPoint(t); seq.setOutPoint(t + frame);
      var r = String(seq.exportAsMediaDirect(out, preset.fsName, app.encoder.ENCODE_IN_TO_OUT)), ok = new File(out).exists;
      say((ok ? '저장=' + out : '실패 ' + stamp + ': ' + r.replace(/\s+/g, ' '))); if (ok) made++;
    }
  } catch (err) { say('오류: ' + err); }
  // 원래대로 돌려 놓기
  for (i = 0; i < n; i++) if (muted[i] !== undefined) { try { tracks[i].setMute(muted[i] ? 1 : 0); } catch (e1) {} }
  try { seq.setInPoint(Number(oldIn)); seq.setOutPoint(Number(oldOut)); } catch (e2) {}
  finish('썸네일 ' + made + '장을 뽑았습니다.\n저장 위치: ' + outDir.fsName, outDir.fsName);
})();
