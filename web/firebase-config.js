/* Firebase 설정과 SDK 연결 — **설정값은 이 파일 한 곳에만 둔다.**
 *
 * 빌드 과정이 없는 정적 사이트다. npm 을 쓰지 않고 CDN 의 ES 모듈을 그대로 가져온다.
 * Google 애널리틱스(getAnalytics / measurementId)는 쓰지 않는다.
 *
 * apiKey 는 숨기는 값이 아니다. 웹 앱에 그대로 박히는 식별자이고, 실제 보호는
 * Realtime Database 보안 규칙(`database.rules.json`)이 한다.
 *
 * 다른 프로젝트로 옮길 때 고칠 곳은 아래 firebaseConfig 하나뿐이다.
 */

const SDK = "https://www.gstatic.com/firebasejs/10.12.5";

export const firebaseConfig = {
  apiKey: "AIzaSyA96HkFRaCHsWTWsbNxuYyjCGHlBk-byZw",
  authDomain: "zombie-game-a9873.firebaseapp.com",
  databaseURL: "https://zombie-game-a9873-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "zombie-game-a9873",
  storageBucket: "zombie-game-a9873.firebasestorage.app",
  messagingSenderId: "491715275228",
  appId: "1:491715275228:web:2077895999a101cce4c719",
};

/** 설정이 비어 있으면 온라인 모드를 아예 열지 않는다. */
export function configured() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.databaseURL);
}

let loading = null;

/**
 * SDK 를 처음 쓸 때만 내려받는다. 혼자 하기·같은 화면 둘이로만 놀면
 * Firebase 는 한 바이트도 내려오지 않는다.
 *
 * 돌려주는 것: { app, auth, db, fns } — fns 에 쓰는 함수들이 모여 있다.
 */
export function loadFirebase() {
  if (loading) return loading;
  loading = (async () => {
    const [appMod, authMod, dbMod] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-auth.js`),
      import(`${SDK}/firebase-database.js`),
    ]);
    const app = appMod.initializeApp(firebaseConfig);
    const auth = authMod.getAuth(app);
    const db = dbMod.getDatabase(app);
    return {
      app,
      auth,
      db,
      fns: {
        signInAnonymously: authMod.signInAnonymously,
        onAuthStateChanged: authMod.onAuthStateChanged,
        ref: dbMod.ref,
        get: dbMod.get,
        set: dbMod.set,
        update: dbMod.update,
        remove: dbMod.remove,
        push: dbMod.push,
        onValue: dbMod.onValue,
        onChildAdded: dbMod.onChildAdded,
        off: dbMod.off,
        serverTimestamp: dbMod.serverTimestamp,
        onDisconnect: dbMod.onDisconnect,
        runTransaction: dbMod.runTransaction,
        query: dbMod.query,
        limitToLast: dbMod.limitToLast,
      },
    };
  })();
  return loading;
}
