/**
 * src/screens/MinhasSubscricoesScreen.js
 * Subscrições detetadas automaticamente via faturas + Gmail
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, FONT, RADIUS, SPACE } from '../constants/theme';
import { apiFetch } from '../services/api';

const C = COLORS;

const RISK_CONFIG = {
  high:   { color: C.red,    label: 'Alto risco',  bg: 'rgba(255,77,109,0.10)'  },
  medium: { color: C.yellow, label: 'Atenção',     bg: 'rgba(255,179,0,0.10)'   },
  ok:     { color: C.green,  label: 'Normal',      bg: 'rgba(0,214,143,0.10)'   },
};

function SubCard({ sub, onDelete, index }) {
  const risk = RISK_CONFIG[sub.risk] || RISK_CONFIG.ok;

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify()}>
      <View style={{
        backgroundColor: C.surface,
        borderRadius: RADIUS.lg,
        borderWidth: 1,
        borderColor: C.border,
        padding: 16,
        marginBottom: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
      }}>
        {/* Ícone */}
        <View style={{
          width: 44, height: 44, borderRadius: 12,
          backgroundColor: risk.bg,
          justifyContent: 'center', alignItems: 'center',
        }}>
          <Text style={{ fontSize: 22 }}>{sub.icone || '📦'}</Text>
        </View>

        {/* Info */}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: FONT.md, fontWeight: '700', color: C.text }}>
            {sub.nome}
          </Text>
          <Text style={{ fontSize: FONT.xs, color: C.textSub, marginTop: 2 }}>
            {sub.categoria} · pago {sub.meses_pago}x
          </Text>
          <View style={{
            marginTop: 5, alignSelf: 'flex-start',
            backgroundColor: risk.bg, borderRadius: 6,
            paddingHorizontal: 7, paddingVertical: 2,
          }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: risk.color }}>
              {risk.label.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Preço + delete */}
        <View style={{ alignItems: 'flex-end', gap: 8 }}>
          <Text style={{ fontSize: FONT.lg, fontWeight: '900', color: C.brand }}>
            {sub.preco_mensal?.toFixed(2)}€
          </Text>
          <Text style={{ fontSize: 10, color: C.textSub }}>/ mês</Text>
          <Pressable
            onPress={() => onDelete(sub.id, sub.nome)}
            hitSlop={8}
            style={{ padding: 4 }}
          >
            <Text style={{ fontSize: 16, color: C.red }}>✕</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

export default function MinhasSubscricoesScreen({ navigation }) {
  const [subs, setSubs]           = useState([]);
  const [resumo, setResumo]       = useState(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefresh]  = useState(false);
  const [detetando, setDetetando] = useState(false);

  const carregar = useCallback(async (refresh = false) => {
    if (refresh) setRefresh(true);
    else setLoading(true);
    try {
      const data = await apiFetch('/subscricoes');
      if (data.success) {
        setSubs(data.subscricoes || []);
        setResumo(data.resumo || null);
      }
    } catch (e) {
      console.warn('Erro subscrições:', e);
    } finally {
      setLoading(false);
      setRefresh(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const detetar = async () => {
    setDetetando(true);
    try {
      const res = await apiFetch('/subscricoes/detetar', { method: 'POST' });
      if (res.success) {
        await carregar();
        const msg = res.detetadas > 0
          ? `${res.detetadas} subscrição(ões) encontrada(s) nas tuas faturas!`
          : 'Nenhuma subscrição nova detetada nas faturas atuais.';
        Alert.alert('Deteção concluída', msg);
      }
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível detetar subscrições. Tenta novamente.');
    } finally {
      setDetetando(false);
    }
  };

  const eliminar = (id, nome) => {
    Alert.alert(
      'Remover subscrição',
      `Remover "${nome}" da lista?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiFetch(`/subscricoes/${id}`, { method: 'DELETE' });
              setSubs(prev => prev.filter(s => s.id !== id));
            } catch (e) {
              Alert.alert('Erro', 'Não foi possível remover.');
            }
          },
        },
      ]
    );
  };

  const totalAnual = resumo?.total_anual || 0;
  const highRisk   = resumo?.high_risk || 0;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={C.brand} size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ padding: SPACE.lg, paddingBottom: 60 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => carregar(true)} tintColor={C.brand} />
      }
    >
      {/* Resumo */}
      {resumo && subs.length > 0 && (
        <Animated.View
          entering={FadeInDown.duration(400).springify()}
          style={{
            backgroundColor: C.surface,
            borderRadius: RADIUS.lg,
            borderWidth: 1,
            borderColor: C.brand + '30',
            padding: 20,
            marginBottom: 20,
          }}
        >
          <Text style={{ fontSize: FONT.xs, color: C.textSub, fontWeight: '700',
            textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>
            Resumo
          </Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 22, fontWeight: '900', color: C.brand }}>
                {resumo.total_mensal?.toFixed(2)}€
              </Text>
              <Text style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>por mês</Text>
            </View>
            <View style={{ width: 1, backgroundColor: C.border }} />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 22, fontWeight: '900', color: C.text }}>
                {totalAnual?.toFixed(0)}€
              </Text>
              <Text style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>por ano</Text>
            </View>
            <View style={{ width: 1, backgroundColor: C.border }} />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 22, fontWeight: '900', color: highRisk > 0 ? C.red : C.green }}>
                {highRisk}
              </Text>
              <Text style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>alto risco</Text>
            </View>
          </View>
        </Animated.View>
      )}

      {/* Botão detetar */}
      <Pressable
        onPress={detetar}
        disabled={detetando}
        style={({ pressed }) => ({
          backgroundColor: detetando ? C.surface : C.brand,
          borderRadius: RADIUS.lg,
          padding: 16,
          alignItems: 'center',
          marginBottom: 20,
          opacity: pressed ? 0.85 : 1,
          flexDirection: 'row',
          justifyContent: 'center',
          gap: 10,
        })}
      >
        {detetando
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={{ fontSize: 18 }}>🔍</Text>
        }
        <Text style={{ fontSize: FONT.md, fontWeight: '800', color: '#fff' }}>
          {detetando ? 'A detetar...' : 'Detetar subscrições automáticas'}
        </Text>
      </Pressable>

      {/* Lista */}
      {subs.length === 0 ? (
        <Animated.View entering={FadeInDown.delay(200).springify()}
          style={{ alignItems: 'center', paddingTop: 40, gap: 12 }}>
          <Text style={{ fontSize: 48 }}>📭</Text>
          <Text style={{ fontSize: FONT.lg, fontWeight: '700', color: C.text }}>
            Sem subscrições
          </Text>
          <Text style={{ fontSize: FONT.sm, color: C.textSub, textAlign: 'center', maxWidth: 260 }}>
            Toca em "Detetar" para a Verly analisar as tuas faturas e encontrar subscrições automáticas.
          </Text>
        </Animated.View>
      ) : (
        <>
          <Text style={{ fontSize: FONT.xs, color: C.textSub, fontWeight: '700',
            textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
            {subs.length} subscrição{subs.length !== 1 ? 'ões' : ''} encontrada{subs.length !== 1 ? 's' : ''}
          </Text>
          {subs.map((sub, i) => (
            <SubCard key={sub.id} sub={sub} onDelete={eliminar} index={i} />
          ))}
        </>
      )}
    </ScrollView>
  );
}