/**
 * src/components/DrawerContent.js
 * Menu lateral deslizável — perfil do utilizador + todos os ecrãs + logout
 */

import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, SafeAreaView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, FileText, MessageSquare, Target,
  User, Bell, CreditCard, BarChart2, Star, Brain,
  FileBarChart, History, LogOut, ChevronRight, Shield,
} from 'lucide-react-native';

const C = {
  bg:       '#0C0C14',
  surface:  '#13131F',
  surface2: '#1C1C2E',
  border:   '#252540',
  brand:    '#6C5CE7',
  brandDim: 'rgba(108,92,231,0.15)',
  text:     '#EEEEF8',
  textSub:  '#7070A0',
  red:      '#FF5370',
  green:    '#00C896',
};

const MAIN_ITEMS = [
  { screen: 'Dashboard',   label: 'Início',       Icon: LayoutDashboard },
  { screen: 'Faturas',     label: 'Faturas',       Icon: FileText        },
  { screen: 'Chat',        label: 'Chat IA',       Icon: MessageSquare   },
  { screen: 'Metas',       label: 'Metas',         Icon: Target          },
  { screen: 'Perfil',      label: 'Perfil',        Icon: User            },
];

const TOOLS_ITEMS = [
  { screen: 'Historico',    label: 'Histórico',    Icon: History         },
  { screen: 'Relatorio',   label: 'Relatório',     Icon: FileBarChart    },
  { screen: 'Score',       label: 'Score',          Icon: Star            },
  { screen: 'Impulse',     label: 'Impulse Control',Icon: Brain           },
  { screen: 'Estatisticas',label: 'Estatísticas',  Icon: BarChart2       },
  { screen: 'Subscricoes', label: 'Subscrições',   Icon: Shield          },
];

const BOTTOM_ITEMS = [
  { screen: 'Notificacoes', label: 'Notificações', Icon: Bell },
];

function DrawerItem({ item, onPress, active, badge }) {
  const { Icon, label } = item;
  return (
    <TouchableOpacity
      style={[styles.item, active && styles.itemActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.itemIcon, active && styles.itemIconActive]}>
        <Icon size={17} color={active ? C.brand : C.textSub} strokeWidth={active ? 2.2 : 1.8} />
      </View>
      <Text style={[styles.itemLabel, active && styles.itemLabelActive]}>{label}</Text>
      {badge > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      )}
      {active && <ChevronRight size={14} color={C.brand} style={{ marginLeft: 'auto' }} />}
    </TouchableOpacity>
  );
}

function SectionLabel({ label }) {
  return <Text style={styles.sectionLabel}>{label}</Text>;
}

export default function DrawerContent({ navigation, state, notifCount = 0 }) {
  const { user, logout } = useAuth();

  // Nome da rota activa
  const activeRoute = state?.routeNames?.[state?.index] ?? '';

  const navigate = (screen) => {
    navigation.closeDrawer();
    // Tabs principais navegam dentro dos tabs; secundários via MainStack
    const tabScreens = ['Dashboard', 'Faturas', 'Chat', 'Metas', 'Perfil'];
    if (tabScreens.includes(screen)) {
      navigation.navigate('Tabs', { screen });
    } else {
      navigation.navigate(screen);
    }
  };

  const handleLogout = async () => {
    navigation.closeDrawer();
    await logout();
  };

  // Iniciais do nome
  const initials = user?.nome
    ? user.nome.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : '?';

  return (
    <SafeAreaView style={styles.root}>
      {/* Cabeçalho — perfil */}
      <View style={styles.profileWrap}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.profileName} numberOfLines={1}>{user?.nome || 'Utilizador'}</Text>
          <Text style={styles.profileEmail} numberOfLines={1}>{user?.email || ''}</Text>
        </View>
      </View>

      <View style={styles.divider} />

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {/* Navegação principal */}
        <SectionLabel label="PRINCIPAL" />
        {MAIN_ITEMS.map(item => (
          <DrawerItem
            key={item.screen}
            item={item}
            active={activeRoute === item.screen}
            onPress={() => navigate(item.screen)}
          />
        ))}

        <View style={styles.divider} />

        {/* Ferramentas */}
        <SectionLabel label="FERRAMENTAS" />
        {TOOLS_ITEMS.map(item => (
          <DrawerItem
            key={item.screen}
            item={item}
            active={activeRoute === item.screen}
            onPress={() => navigate(item.screen)}
          />
        ))}

        <View style={styles.divider} />

        {/* Notificações */}
        {BOTTOM_ITEMS.map(item => (
          <DrawerItem
            key={item.screen}
            item={item}
            active={activeRoute === item.screen}
            badge={item.screen === 'Notificacoes' ? notifCount : 0}
            onPress={() => navigate(item.screen)}
          />
        ))}
      </ScrollView>

      {/* Rodapé — logout */}
      <View style={styles.divider} />
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
        <LogOut size={17} color={C.red} strokeWidth={1.8} />
        <Text style={styles.logoutText}>Terminar Sessão</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1 },

  profileWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingTop: 24, paddingBottom: 20,
  },
  avatar: {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: C.brandDim,
    borderWidth: 1.5, borderColor: C.brand,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText:   { fontSize: 17, fontWeight: '800', color: C.brand },
  profileName:  { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 2 },
  profileEmail: { fontSize: 12, color: C.textSub },

  divider: { height: 1, backgroundColor: C.border, marginVertical: 8, marginHorizontal: 20 },

  sectionLabel: {
    fontSize: 10, fontWeight: '700', color: C.textSub,
    letterSpacing: 1.2, textTransform: 'uppercase',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4,
  },

  item: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 11,
    marginHorizontal: 8, borderRadius: 12,
  },
  itemActive: { backgroundColor: C.brandDim },
  itemIcon: {
    width: 34, height: 34, borderRadius: 9,
    backgroundColor: C.surface2,
    justifyContent: 'center', alignItems: 'center',
  },
  itemIconActive: { backgroundColor: 'rgba(108,92,231,0.25)' },
  itemLabel:      { fontSize: 14, fontWeight: '600', color: C.textSub, flex: 1 },
  itemLabelActive:{ color: C.text, fontWeight: '700' },

  badge: {
    backgroundColor: C.red, borderRadius: 10,
    minWidth: 20, height: 20,
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },

  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 28, paddingVertical: 20,
  },
  logoutText: { fontSize: 14, fontWeight: '700', color: C.red },
});