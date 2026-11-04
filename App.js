import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet,
  ActivityIndicator, SafeAreaView, Image, Modal,
} from 'react-native';
import { createClient } from '@supabase/supabase-js';

// ====================== الإعدادات ======================
// القيم تُقرأ وقت البناء من متغيرات البيئة في Vercel.
// مفتاح anon عام بطبيعته وآمن لأن الحماية تتم عبر RLS.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const SHAM_CASH_NUMBER = 'ضع_رقم_شام_كاش_هنا'; // رقم استقبال الأموال (ليس سراً)
const CONFIG_OK = SUPABASE_URL.startsWith('http') && SUPABASE_ANON_KEY.length > 20;

const supabase = CONFIG_OK
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true, flowType: 'pkce' },
    })
  : null;

// ====================== الثيم ======================
const C = {
  bg: '#0B0B0F', card: '#16161D', card2: '#1E1E28', gold: '#D4AF37', goldSoft: '#F0D77B',
  text: '#F5F5F5', muted: '#9A9AA5', danger: '#E5484D', ok: '#3DD68C', border: '#2A2A36',
};
const STATUS = {
  pending: { t: 'قيد الانتظار', c: '#F5A524' },
  processing: { t: 'قيد التنفيذ', c: '#4DA3FF' },
  completed: { t: 'مكتمل', c: C.ok },
  rejected: { t: 'مرفوض', c: C.danger },
};
const ERRORS = {
  INSUFFICIENT_BALANCE: 'رصيدك غير كافٍ. اشحن محفظتك أولاً.',
  INVALID_PLAYER_ID: 'أدخل Player ID صحيحاً (5 أرقام على الأقل).',
  PACKAGE_NOT_FOUND: 'الباقة غير متاحة حالياً.',
  NOT_ENOUGH_POINTS: 'نقاطك غير كافية.',
  INVALID_REWARD: 'مكافأة غير صالحة.',
  INVALID_CODE: 'كود الإحالة غير صحيح.',
  SELF_REFERRAL: 'لا يمكنك استخدام كودك الخاص.',
  ALREADY_REFERRED: 'لقد استخدمت كود إحالة من قبل.',
  FORBIDDEN: 'ليست لديك صلاحية.',
  WALLET_NOT_FOUND: 'رقم المحفظة غير موجود.',
  INVALID_AMOUNT: 'المبلغ غير صالح.',
  ORDER_FINALIZED: 'هذا الطلب منتهٍ ولا يمكن تغييره.',
};
const errMsg = (e) => {
  const m = (e && e.message) || '';
  for (const k in ERRORS) if (m.includes(k)) return ERRORS[k];
  return m || 'حدث خطأ غير متوقع';
};
// ---- بدائل الويب لـ Alert و Share و Clipboard ----
let dialogSetter = null;
const Alert = {
  alert(title, message, buttons) {
    if (dialogSetter) {
      dialogSetter({ title, message, buttons: buttons && buttons.length ? buttons : [{ text: 'حسناً' }] });
    }
  },
};
const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(String(text));
  } catch (e) {
    const el = document.createElement('textarea');
    el.value = String(text);
    document.body.appendChild(el);
    el.select();
    try { document.execCommand('copy'); } catch (_) {}
    document.body.removeChild(el);
  }
};
const copy = async (text) => {
  await copyText(text);
  Alert.alert('تم النسخ', String(text));
};
const Share = {
  share: async ({ message }) => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try { await navigator.share({ text: message }); return; } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    await copyText(message);
    Alert.alert('تم نسخ رسالة الدعوة', 'ألصقها وأرسلها لأصدقائك');
  },
};
const money = (n) => `$${Number(n || 0).toFixed(2)}`;

// ====================== مكونات مشتركة ======================
const Btn = ({ title, onPress, kind, disabled, loading, style }) => (
  <TouchableOpacity
    activeOpacity={0.8}
    disabled={disabled || loading}
    onPress={onPress}
    style={[s.btn, kind === 'ghost' && s.btnGhost, kind === 'danger' && { backgroundColor: C.danger },
      (disabled || loading) && { opacity: 0.5 }, style]}
  >
    {loading ? <ActivityIndicator color="#000" /> : (
      <Text style={[s.btnTxt, kind === 'ghost' && { color: C.gold }, kind === 'danger' && { color: '#fff' }]}>{title}</Text>
    )}
  </TouchableOpacity>
);

const Screen = ({ title, onBack, children }) => (
  <SafeAreaView style={s.safe}>
    <View style={s.header}>
      <Text style={s.headerTitle}>{title}</Text>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={s.backBtn}><Text style={s.backTxt}>رجوع ›</Text></TouchableOpacity>
      ) : <View style={{ width: 60 }} />}
    </View>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  </SafeAreaView>
);

const Loader = () => (
  <View style={[s.safe, { justifyContent: 'center', alignItems: 'center' }]}>
    <ActivityIndicator size="large" color={C.gold} />
  </View>
);

const CopyRow = ({ label, value }) => (
  <View style={s.card}>
    <Text style={s.label}>{label}</Text>
    <Text style={s.mono} selectable>{value}</Text>
    <Btn title="نسخ" kind="ghost" onPress={() => copy(value)} style={{ marginTop: 10 }} />
  </View>
);

// ====================== تسجيل الدخول ======================
function Login() {
  const [busy, setBusy] = useState(false);
  const signIn = async () => {
    try {
      setBusy(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    } catch (e) {
      Alert.alert('تعذر تسجيل الدخول', errMsg(e));
      setBusy(false);
    }
  };
  return (
    <SafeAreaView style={[s.safe, { justifyContent: 'center', padding: 24 }]}>
      <View style={{ alignItems: 'center', marginBottom: 40 }}>
        <Text style={{ fontSize: 64 }}>⚡</Text>
        <Text style={s.logo}>شحن ميكس</Text>
        <Text style={[s.muted, { textAlign: 'center', marginTop: 8 }]}>
          اشحن ألعابك بسرعة وأمان. سجّل الدخول للمتابعة.
        </Text>
      </View>
      <Btn title="تسجيل الدخول عبر Google" onPress={signIn} loading={busy} />
    </SafeAreaView>
  );
}

// ====================== الرئيسية ======================
function Home({ go, profile, wallet, logout }) {
  const [games, setGames] = useState(null);
  useEffect(() => {
    supabase.from('games').select('*').eq('is_active', true).order('sort_order')
      .then(({ data }) => setGames(data || []));
  }, []);

  return (
    <Screen title="شحن ميكس">
      <View style={s.balanceCard}>
        <Text style={{ color: '#000', opacity: 0.7, textAlign: 'right' }}>رصيدك</Text>
        <Text style={s.balanceNum}>{money(wallet?.balance)}</Text>
        <Text style={{ color: '#000', textAlign: 'right' }}>{wallet?.code}</Text>
      </View>

      <View style={s.rowWrap}>
        <Btn title="🔎 تتبع الطلب" kind="ghost" onPress={() => go('track')} style={s.half} />
        <Btn title="👛 المحفظة" kind="ghost" onPress={() => go('wallet')} style={s.half} />
        <Btn title="⭐ النقاط" kind="ghost" onPress={() => go('points')} style={s.half} />
        <Btn title="🤝 الإحالة" kind="ghost" onPress={() => go('referral')} style={s.half} />
      </View>
      {profile?.role === 'admin' && (
        <Btn title="🛠 لوحة الأدمن" onPress={() => go('admin')} style={{ marginBottom: 12 }} />
      )}

      <Text style={s.section}>الألعاب</Text>
      {games === null ? <ActivityIndicator color={C.gold} /> :
        games.length === 0 ? <Text style={s.muted}>لا توجد ألعاب متاحة حالياً</Text> :
        games.map((g) => (
          <TouchableOpacity key={g.id} style={[s.card, s.rowRev]} onPress={() => go('game', { game: g })}>
            {g.icon_url ? <Image source={{ uri: g.icon_url }} style={s.gameIcon} /> :
              <View style={[s.gameIcon, { backgroundColor: C.card2, justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ fontSize: 26 }}>🎮</Text>
              </View>}
            <Text style={[s.cardTitle, { flex: 1, marginHorizontal: 12 }]}>{g.name}</Text>
            <Text style={{ color: C.gold, fontSize: 20 }}>‹</Text>
          </TouchableOpacity>
        ))}

      <Btn title="تسجيل الخروج" kind="ghost" onPress={logout} style={{ marginTop: 20 }} />
      <Text style={[s.muted, { textAlign: 'center', marginTop: 10, fontSize: 12 }]}>{profile?.email}</Text>
    </Screen>
  );
}

// ====================== المحفظة ======================
function Wallet({ back, wallet }) {
  return (
    <Screen title="المحفظة" onBack={back}>
      <View style={s.balanceCard}>
        <Text style={{ color: '#000', opacity: 0.7, textAlign: 'right' }}>الرصيد الحالي</Text>
        <Text style={s.balanceNum}>{money(wallet?.balance)}</Text>
      </View>
      <CopyRow label="رقم محفظتك" value={wallet?.code || '-'} />
      <CopyRow label="رقم شام كاش (للإيداع)" value={SHAM_CASH_NUMBER} />
      <View style={s.card}>
        <Text style={s.cardTitle}>كيف أشحن رصيدي؟</Text>
        <Text style={[s.muted, { marginTop: 8, lineHeight: 22 }]}>
          1) حوّل المبلغ المطلوب إلى رقم شام كاش أعلاه.{'\n'}
          2) أرسل لنا إثبات التحويل مع رقم محفظتك.{'\n'}
          3) تتم إضافة الرصيد يدوياً من الإدارة خلال دقائق.
        </Text>
      </View>
    </Screen>
  );
}

// ====================== شاشة اللعبة ======================
function GameScreen({ back, go, params }) {
  const { game } = params;
  const [pkgs, setPkgs] = useState(null);
  useEffect(() => {
    supabase.from('packages').select('*').eq('game_id', game.id).eq('is_active', true).order('price')
      .then(({ data }) => setPkgs(data || []));
  }, [game.id]);

  return (
    <Screen title={game.name} onBack={back}>
      <Text style={s.section}>اختر الباقة</Text>
      {pkgs === null ? <ActivityIndicator color={C.gold} /> :
        pkgs.length === 0 ? <Text style={s.muted}>لا توجد باقات متاحة</Text> :
        pkgs.map((p) => (
          <TouchableOpacity key={p.id} style={[s.card, s.rowRev]} onPress={() => go('order', { game, pkg: p })}>
            <Text style={[s.cardTitle, { flex: 1 }]}>{p.name}</Text>
            <Text style={{ color: C.gold, fontSize: 18, fontWeight: '700' }}>{money(p.price)}</Text>
          </TouchableOpacity>
        ))}
    </Screen>
  );
}

// ====================== شاشة الطلب ======================
function OrderScreen({ back, go, params, wallet, refresh }) {
  const { game, pkg } = params;
  const [playerId, setPlayerId] = useState('');
  const [busy, setBusy] = useState(false);
  const enough = Number(wallet?.balance || 0) >= Number(pkg.price);

  const confirm = () => {
    if (playerId.trim().length < 5) return Alert.alert('تنبيه', ERRORS.INVALID_PLAYER_ID);
    Alert.alert('تأكيد الطلب', `سيتم خصم ${money(pkg.price)} من محفظتك.\nPlayer ID: ${playerId.trim()}`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تأكيد', onPress: submit },
    ]);
  };
  const submit = async () => {
    try {
      setBusy(true);
      const { data, error } = await supabase.rpc('place_order', {
        p_package_id: pkg.id, p_player_id: playerId.trim(),
      });
      if (error) throw error;
      await refresh();
      Alert.alert('تم إنشاء الطلب ✅', `رقم طلبك: ${data}`);
      go('track', { number: data }, true);
    } catch (e) {
      Alert.alert('تعذر إنشاء الطلب', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="تأكيد الطلب" onBack={back}>
      <View style={s.card}>
        <Text style={s.label}>اللعبة</Text><Text style={s.val}>{game.name}</Text>
        <Text style={[s.label, { marginTop: 10 }]}>الباقة</Text><Text style={s.val}>{pkg.name}</Text>
        <Text style={[s.label, { marginTop: 10 }]}>السعر</Text>
        <Text style={[s.val, { color: C.gold }]}>{money(pkg.price)}</Text>
        <Text style={[s.label, { marginTop: 10 }]}>رصيدك</Text>
        <Text style={[s.val, { color: enough ? C.ok : C.danger }]}>{money(wallet?.balance)}</Text>
      </View>
      <Text style={s.label}>Player ID</Text>
      <TextInput
        style={s.input} value={playerId} onChangeText={setPlayerId}
        placeholder="مثال: 5123456789" placeholderTextColor={C.muted} keyboardType="number-pad"
      />
      {!enough && <Text style={{ color: C.danger, textAlign: 'right', marginBottom: 10 }}>{ERRORS.INSUFFICIENT_BALANCE}</Text>}
      <Btn title="تأكيد الطلب والخصم من المحفظة" onPress={confirm} loading={busy} disabled={!enough} />
      {!enough && <Btn title="اشحن المحفظة" kind="ghost" onPress={() => go('wallet')} style={{ marginTop: 10 }} />}
    </Screen>
  );
}

// ====================== تتبع الطلب ======================
function Track({ back, params }) {
  const [num, setNum] = useState(params?.number || '');
  const [order, setOrder] = useState(null);
  const [recent, setRecent] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const search = useCallback(async (n) => {
    const q = (n ?? num).trim().toUpperCase();
    if (!q) return;
    setBusy(true); setMsg(''); setOrder(null);
    const { data, error } = await supabase.from('orders')
      .select('*, games(name), packages(name)').eq('order_number', q).maybeSingle();
    setBusy(false);
    if (error) return setMsg(errMsg(error));
    if (!data) return setMsg('لم يتم العثور على طلب بهذا الرقم');
    setOrder(data);
  }, [num]);

  useEffect(() => {
    supabase.from('orders').select('order_number, status, packages(name)')
      .order('created_at', { ascending: false }).limit(10).then(({ data }) => setRecent(data || []));
    if (params?.number) search(params.number);
  }, []); // eslint-disable-line

  const st = order ? STATUS[order.status] : null;
  return (
    <Screen title="تتبع الطلب" onBack={back}>
      <TextInput
        style={s.input} value={num} onChangeText={setNum} autoCapitalize="characters"
        placeholder="رقم الطلب مثل MX100001" placeholderTextColor={C.muted}
      />
      <Btn title="بحث" onPress={() => search()} loading={busy} />
      {!!msg && <Text style={{ color: C.danger, textAlign: 'right', marginTop: 12 }}>{msg}</Text>}
      {order && (
        <View style={[s.card, { marginTop: 16 }]}>
          <Text style={s.cardTitle}>{order.order_number}</Text>
          <View style={[s.badge, { backgroundColor: st.c }]}><Text style={s.badgeTxt}>{st.t}</Text></View>
          <Text style={s.muted}>{order.games?.name} - {order.packages?.name}</Text>
          <Text style={s.muted}>Player ID: {order.player_id}</Text>
          <Text style={s.muted}>المبلغ: {money(order.amount)}</Text>
          <Text style={s.muted}>التاريخ: {new Date(order.created_at).toLocaleString('ar')}</Text>
        </View>
      )}
      {recent.length > 0 && <Text style={[s.section, { marginTop: 24 }]}>آخر طلباتك</Text>}
      {recent.map((o) => (
        <TouchableOpacity key={o.order_number} style={[s.card, s.rowRev]}
          onPress={() => { setNum(o.order_number); search(o.order_number); }}>
          <Text style={[s.cardTitle, { flex: 1 }]}>{o.order_number} · {o.packages?.name}</Text>
          <Text style={{ color: STATUS[o.status].c, fontWeight: '700' }}>{STATUS[o.status].t}</Text>
        </TouchableOpacity>
      ))}
    </Screen>
  );
}

// ====================== النقاط ======================
const REWARDS = [
  { pts: 100, label: 'رصيد $1' },
  { pts: 500, label: 'رصيد $5' },
  { pts: 1000, label: 'رصيد $10' },
];
function Points({ back, profile, refresh }) {
  const [busy, setBusy] = useState(null);
  const redeem = async (pts) => {
    try {
      setBusy(pts);
      const { error } = await supabase.rpc('redeem_points', { p_points: pts });
      if (error) throw error;
      await refresh();
      Alert.alert('تم الاستبدال ✅', 'أُضيف الرصيد إلى محفظتك');
    } catch (e) { Alert.alert('تعذر الاستبدال', errMsg(e)); } finally { setBusy(null); }
  };
  return (
    <Screen title="النقاط" onBack={back}>
      <View style={s.balanceCard}>
        <Text style={{ color: '#000', opacity: 0.7, textAlign: 'right' }}>نقاطك</Text>
        <Text style={s.balanceNum}>{profile?.points_balance ?? 0}</Text>
      </View>
      <Text style={[s.muted, { textAlign: 'right', marginBottom: 12 }]}>تحصل على نقطة لكل $1 من الطلبات المكتملة.</Text>
      <Text style={s.section}>مكافآت الاستبدال</Text>
      {REWARDS.map((r) => (
        <View key={r.pts} style={[s.card, s.rowRev]}>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>{r.label}</Text>
            <Text style={s.muted}>{r.pts} نقطة</Text>
          </View>
          <Btn title="استبدال" onPress={() => redeem(r.pts)} loading={busy === r.pts}
            disabled={(profile?.points_balance ?? 0) < r.pts} style={{ paddingHorizontal: 18, minWidth: 100 }} />
        </View>
      ))}
    </Screen>
  );
}

// ====================== الإحالة ======================
function Referral({ back, profile, refresh }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const share = () => Share.share({
    message: `جرّب تطبيق شحن ميكس لشحن ببجي بسرعة وأمان! استخدم كود الإحالة ${profile?.referral_code} واحصل على 50 نقطة هدية 🎁`,
  });
  const apply = async () => {
    try {
      setBusy(true);
      const { error } = await supabase.rpc('apply_referral', { p_code: code });
      if (error) throw error;
      await refresh(); setCode('');
      Alert.alert('تم ✅', 'حصلت على 50 نقطة');
    } catch (e) { Alert.alert('تعذر التطبيق', errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Screen title="الإحالة" onBack={back}>
      <CopyRow label="كود الإحالة الخاص بك" value={profile?.referral_code || '-'} />
      <Btn title="مشاركة الكود" onPress={share} />
      <Text style={[s.muted, { textAlign: 'right', marginTop: 10 }]}>أنت وصديقك تحصلان على 50 نقطة عند استخدامه لكودك.</Text>
      {!profile?.referred_by && (
        <View style={{ marginTop: 24 }}>
          <Text style={s.label}>لديك كود من صديق؟</Text>
          <TextInput style={s.input} value={code} onChangeText={setCode} autoCapitalize="characters"
            placeholder="REF-XXXX" placeholderTextColor={C.muted} />
          <Btn title="تطبيق الكود" kind="ghost" onPress={apply} loading={busy} disabled={!code.trim()} />
        </View>
      )}
    </Screen>
  );
}

// ====================== الأدمن ======================
function Admin({ back, profile }) {
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [wCode, setWCode] = useState('');
  const [wAmt, setWAmt] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [o, u] = await Promise.all([
      supabase.from('orders').select('*, games(name), packages(name), profiles(email)')
        .order('created_at', { ascending: false }).limit(100),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
    ]);
    setOrders(o.data || []); setUsers(u.count || 0); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (profile?.role !== 'admin') {
    return <Screen title="الأدمن" onBack={back}><Text style={s.muted}>غير مصرّح لك بالدخول.</Text></Screen>;
  }

  const setStatus = async (id, status) => {
    try {
      const { error } = await supabase.rpc('admin_set_order_status', { p_order_id: id, p_status: status });
      if (error) throw error;
      await load();
    } catch (e) { Alert.alert('خطأ', errMsg(e)); }
  };
  const addBalance = async () => {
    const amt = parseFloat(wAmt);
    if (!wCode.trim() || !(amt > 0)) return Alert.alert('تنبيه', 'أدخل رقم المحفظة ومبلغاً صحيحاً');
    try {
      setBusy(true);
      const { data, error } = await supabase.rpc('admin_add_balance', { p_wallet_code: wCode, p_amount: amt });
      if (error) throw error;
      Alert.alert('تم ✅', `الرصيد الجديد: ${money(data)}`);
      setWCode(''); setWAmt('');
    } catch (e) { Alert.alert('خطأ', errMsg(e)); } finally { setBusy(false); }
  };

  const pending = orders.filter((o) => o.status === 'pending' || o.status === 'processing').length;
  const revenue = orders.filter((o) => o.status === 'completed').reduce((a, o) => a + Number(o.amount), 0);

  return (
    <Screen title="لوحة الأدمن" onBack={back}>
      <View style={s.rowWrap}>
        <View style={[s.stat, s.half]}><Text style={s.statNum}>{users}</Text><Text style={s.muted}>المستخدمون</Text></View>
        <View style={[s.stat, s.half]}><Text style={s.statNum}>{orders.length}</Text><Text style={s.muted}>الطلبات</Text></View>
        <View style={[s.stat, s.half]}><Text style={s.statNum}>{pending}</Text><Text style={s.muted}>قيد المعالجة</Text></View>
        <View style={[s.stat, s.half]}><Text style={s.statNum}>{money(revenue)}</Text><Text style={s.muted}>المبيعات المكتملة</Text></View>
      </View>

      <Text style={s.section}>إضافة رصيد يدوياً</Text>
      <View style={s.card}>
        <TextInput style={s.input} value={wCode} onChangeText={setWCode} autoCapitalize="characters"
          placeholder="رقم المحفظة MIX-USR-0001" placeholderTextColor={C.muted} />
        <TextInput style={s.input} value={wAmt} onChangeText={setWAmt} keyboardType="decimal-pad"
          placeholder="المبلغ بالدولار" placeholderTextColor={C.muted} />
        <Btn title="إضافة الرصيد" onPress={addBalance} loading={busy} />
      </View>

      <Text style={s.section}>إدارة الطلبات</Text>
      {loading ? <ActivityIndicator color={C.gold} /> : orders.map((o) => {
        const st = STATUS[o.status];
        const open = o.status === 'pending' || o.status === 'processing';
        return (
          <View key={o.id} style={s.card}>
            <View style={s.rowRev}>
              <Text style={[s.cardTitle, { flex: 1 }]}>{o.order_number}</Text>
              <View style={[s.badge, { backgroundColor: st.c, marginVertical: 0 }]}><Text style={s.badgeTxt}>{st.t}</Text></View>
            </View>
            <Text style={s.muted}>{o.games?.name} - {o.packages?.name} ({money(o.amount)})</Text>
            <Text style={s.muted} selectable>Player ID: {o.player_id}</Text>
            <Text style={s.muted}>{o.profiles?.email}</Text>
            {open && (
              <View style={[s.rowRev, { marginTop: 10 }]}>
                {o.status === 'pending' && <Btn title="تنفيذ" kind="ghost" onPress={() => setStatus(o.id, 'processing')} style={s.third} />}
                <Btn title="اكتمل" onPress={() => setStatus(o.id, 'completed')} style={s.third} />
                <Btn title="رفض" kind="danger" onPress={() =>
                  Alert.alert('رفض الطلب', 'سيُعاد المبلغ إلى محفظة العميل.', [
                    { text: 'إلغاء', style: 'cancel' },
                    { text: 'رفض', style: 'destructive', onPress: () => setStatus(o.id, 'rejected') },
                  ])} style={s.third} />
              </View>
            )}
          </View>
        );
      })}
      <Btn title="تحديث" kind="ghost" onPress={load} style={{ marginTop: 8 }} />
    </Screen>
  );
}

// ====================== نافذة الحوار (بديل Alert) ======================
function DialogHost() {
  const [d, setD] = useState(null);
  useEffect(() => {
    dialogSetter = setD;
    return () => { dialogSetter = null; };
  }, []);
  if (!d) return null;
  const close = (b) => {
    setD(null);
    if (b && b.onPress) setTimeout(b.onPress, 0);
  };
  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => setD(null)}>
      <View style={s.overlay}>
        <View style={s.dialog}>
          <Text style={s.dialogTitle}>{d.title}</Text>
          {!!d.message && <Text style={s.dialogMsg}>{d.message}</Text>}
          <View style={s.dialogBtns}>
            {d.buttons.map((b, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => close(b)}
                style={[s.dialogBtn,
                  b.style === 'cancel' && { backgroundColor: C.card2 },
                  b.style === 'destructive' && { backgroundColor: C.danger }]}
              >
                <Text style={[s.dialogBtnTxt, b.style === 'cancel' && { color: C.text },
                  b.style === 'destructive' && { color: '#fff' }]}>{b.text}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ====================== التطبيق الرئيسي ======================
function MainApp() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [stack, setStack] = useState([{ name: 'home' }]);

  const loadUser = useCallback(async (uid) => {
    for (let i = 0; i < 5; i++) {
      const [p, w] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
        supabase.from('wallets').select('*').eq('user_id', uid).maybeSingle(),
      ]);
      if (p.data && w.data) { setProfile(p.data); setWallet(w.data); return; }
      await new Promise((r) => setTimeout(r, 800));
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => {
      setSession(sess);
      if (sess && window.location.search.includes('code=')) {
        window.history.replaceState({}, '', window.location.pathname);
      }
      if (!sess) { setProfile(null); setWallet(null); setStack([{ name: 'home' }]); }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const uid = session?.user?.id;
  useEffect(() => { if (uid) loadUser(uid); }, [uid, loadUser]);
  const refresh = useCallback(async () => { if (uid) await loadUser(uid); }, [uid, loadUser]);

  // التنقل مع دعم زر الرجوع في المتصفح/الجوال
  const go = (name, params, replace) => {
    setStack((st) => (replace ? [...st.slice(0, -1), { name, params }] : [...st, { name, params }]));
    if (!replace) window.history.pushState({ n: 1 }, '');
  };
  const back = useCallback(() => {
    if (stack.length > 1) window.history.back();
  }, [stack.length]);
  useEffect(() => {
    const onPop = () => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const logout = () => supabase.auth.signOut();

  let body;
  if (!ready) body = <Loader />;
  else if (!session) body = <Login />;
  else if (!profile || !wallet) body = <Loader />;
  else {
    const cur = stack[stack.length - 1];
    const p = { go, back, profile, wallet, refresh, params: cur.params, logout };
    switch (cur.name) {
      case 'wallet': body = <Wallet {...p} />; break;
      case 'game': body = <GameScreen {...p} />; break;
      case 'order': body = <OrderScreen {...p} />; break;
      case 'track': body = <Track {...p} />; break;
      case 'points': body = <Points {...p} />; break;
      case 'referral': body = <Referral {...p} />; break;
      case 'admin': body = <Admin {...p} />; break;
      default: body = <Home {...p} />;
    }
  }
  return body;
}

function ConfigError() {
  return (
    <SafeAreaView style={[s.safe, { justifyContent: 'center', padding: 24 }]}>
      <Text style={[s.cardTitle, { color: C.danger, textAlign: 'center' }]}>إعدادات Supabase ناقصة</Text>
      <Text style={[s.muted, { textAlign: 'center', marginTop: 10, lineHeight: 22 }]}>
        أضف المتغيرين EXPO_PUBLIC_SUPABASE_URL و EXPO_PUBLIC_SUPABASE_ANON_KEY في إعدادات Vercel
        (Settings ثم Environment Variables) ثم أعد النشر (Redeploy).
      </Text>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center' }}>
        {CONFIG_OK ? <MainApp /> : <ConfigError />}
      </View>
      <DialogHost />
    </View>
  );
}

// ====================== الأنماط (RTL) ======================
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg, paddingTop: 0 },
  header: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerTitle: { color: C.gold, fontSize: 20, fontWeight: '800' },
  backBtn: { width: 60 },
  backTxt: { color: C.goldSoft, fontSize: 15, textAlign: 'left' },
  logo: { color: C.gold, fontSize: 36, fontWeight: '900', marginTop: 8 },
  section: { color: C.goldSoft, fontSize: 17, fontWeight: '700', textAlign: 'right', marginVertical: 12 },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  cardTitle: { color: C.text, fontSize: 16, fontWeight: '700', textAlign: 'right' },
  label: { color: C.muted, fontSize: 13, textAlign: 'right', marginBottom: 6 },
  val: { color: C.text, fontSize: 16, textAlign: 'right', fontWeight: '600' },
  mono: { color: C.text, fontSize: 20, fontWeight: '700', textAlign: 'right', letterSpacing: 1 },
  muted: { color: C.muted, textAlign: 'right', fontSize: 14, marginTop: 2 },
  rowRev: { flexDirection: 'row-reverse', alignItems: 'center' },
  rowWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'space-between' },
  half: { width: '48.5%', marginBottom: 10 },
  third: { width: '31.5%', marginHorizontal: 2, paddingVertical: 10 },
  input: {
    backgroundColor: C.card2, color: C.text, borderRadius: 12, padding: 14, fontSize: 16,
    textAlign: 'right', borderWidth: 1, borderColor: C.border, marginBottom: 12,
  },
  btn: { backgroundColor: C.gold, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.gold },
  btnTxt: { color: '#000', fontSize: 15, fontWeight: '800' },
  balanceCard: { backgroundColor: C.gold, borderRadius: 18, padding: 20, marginBottom: 14 },
  balanceNum: { color: '#000', fontSize: 38, fontWeight: '900', textAlign: 'right' },
  gameIcon: { width: 52, height: 52, borderRadius: 12 },
  badge: { alignSelf: 'flex-end', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, marginVertical: 8 },
  badgeTxt: { color: '#000', fontWeight: '800', fontSize: 12 },
  stat: { backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 10, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  statNum: { color: C.gold, fontSize: 22, fontWeight: '900' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 24 },
  dialog: { backgroundColor: C.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: C.border, width: '100%', maxWidth: 420, alignSelf: 'center' },
  dialogTitle: { color: C.gold, fontSize: 18, fontWeight: '800', textAlign: 'right' },
  dialogMsg: { color: C.text, fontSize: 15, textAlign: 'right', marginTop: 10, lineHeight: 22 },
  dialogBtns: { flexDirection: 'row-reverse', flexWrap: 'wrap', marginTop: 18 },
  dialogBtn: { backgroundColor: C.gold, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20, marginLeft: 8, marginBottom: 6 },
  dialogBtnTxt: { color: '#000', fontWeight: '800', fontSize: 14 },
});
