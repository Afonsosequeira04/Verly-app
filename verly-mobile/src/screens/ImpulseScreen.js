/**
 * src/screens/ImpulseScreen.js
 * Impulse Control Mode — analisa antes de comprar
 * Design polished: sem emojis, Lucide icons, layout limpo
 */

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import {
  Brain, ShieldCheck, ShieldX, Lightbulb, AlignLeft,
  RotateCcw, Flame, Smile, Wind, BarChart2,
} from 'lucide-react-native';
import { impulseAPI } from '../services/api';

const C = {
  brand:   '#6C5CE7',
  bg:      '#0C0C14',
  surface: '#13131F',
  surface2:'#1C1C2E',
  border:  '#252540',
  text:    '#EEEEF8',
  textSub: '#7070A0',
  green:   '#00C896',
  red:     '#FF5370',
  yellow:  '#FFB300',
};

const PERSONALIDADES = [
  {
    key:   'calm',
    label: 'Calmo',
    desc:  'Empático e construtivo',
    color: C.green,
    Icon:  Wind,
  },
  {
    key:   'pro',
    label: 'Profissional',
    desc:  'Análise financeira fria',
    color: C.brand,
    Icon:  BarChart2,
  },
  {
    key:   'sarcastic',
    label: 'Sarcástico',
    desc:  'Irónico mas útil',
    color: C.yellow,
    Icon:  Smile,
  },
  {
    key:   'savage',
    label: 'Direto',
    desc:  'Brutal e sem filtros',
    color: C.red,
    Icon:  Flame,
  },
];

export default function ImpulseScreen() {
  const [produto,       setProduto]       = useState('');
  const [personalidade, setPersonalidade] = useState('calm');
  const [loading,       setLoading]       = useState(false);
  const [resultado,     setResultado]     = useState(null);

  const pInfo = PERSONALIDADES.find(p => p.key === personalidade) || PERSONALIDADES[0];

  const analisar = async () => {
    if (!produto.trim()) {
      Alert.alert('Atenção', 'Descreve o que queres comprar.');
      return;
    }
    setLoading(true);
    setResultado(null);
    try {
      const data = await impulseAPI.analisar({ produto: produto.trim(), personalidade });
      if (data.success) setResultado(data.resultado);
    } catch (e) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => { setResultado(null); setProduto(''); };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Brain size={22} color={C.brand} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Impulse Control</Text>
          <Text style={styles.headerSub}>Pensa duas vezes antes de gastar</Text>
        </View>
      </View>

      {/* Form */}
      <View style={styles.card}>
        <Text style={styles.label}>O que queres comprar?</Text>
        <TextInput
          style={styles.textarea}
          value={produto}
          onChangeText={setProduto}
          placeholder="Descreve o produto e porque queres comprar..."
          placeholderTextColor={C.textSub}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        <Text style={styles.label}>Tom da análise</Text>
        <View style={styles.persGrid}>
          {PERSONALIDADES.map(p => {
            const active = personalidade === p.key;
            const { Icon } = p;
            return (
              <TouchableOpacity
                key={p.key}
                style={[styles.persBtn, active && { borderColor: p.color, backgroundColor: `${p.color}15` }]}
                onPress={() => setPersonalidade(p.key)}
              >
                <View style={[styles.persIconWrap, active && { backgroundColor: `${p.color}22` }]}>
                  <Icon size={16} color={active ? p.color : C.textSub} />
                </View>
                <Text style={[styles.persBtnLabel, active && { color: p.color }]}>{p.label}</Text>
                <Text style={styles.persBtnDesc}>{p.desc}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: pInfo.color }, loading && { opacity: 0.6 }]}
          onPress={analisar}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>Analisar com Verly</Text>
          }
        </TouchableOpacity>
      </View>

      {/* Resultado */}
      {resultado && (
        <View style={styles.card}>
          {/* Veredicto */}
          <View style={[
            styles.veredictoBox,
            { borderColor: resultado.aguardar ? C.red : C.green,
              backgroundColor: resultado.aguardar ? 'rgba(255,83,112,0.08)' : 'rgba(0,200,150,0.08)' }
          ]}>
            {resultado.aguardar
              ? <ShieldX  size={20} color={C.red}   style={{ marginRight: 10 }} />
              : <ShieldCheck size={20} color={C.green} style={{ marginRight: 10 }} />
            }
            <Text style={[styles.veredictoText, { color: resultado.aguardar ? C.red : C.green }]}>
              {resultado.aguardar ? 'Espera antes de comprar' : 'Podes avançar'}
            </Text>
          </View>

          {/* Frase principal */}
          <View style={styles.quoteBox}>
            <Text style={styles.quoteText}>"{resultado.veredicto}"</Text>
          </View>

          {/* Análise */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <AlignLeft size={13} color={C.textSub} />
              <Text style={styles.sectionTitle}>Análise</Text>
            </View>
            <Text style={styles.sectionText}>{resultado.analise}</Text>
          </View>

          <View style={styles.divider} />

          {/* Alternativa */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Lightbulb size={13} color={C.yellow} />
              <Text style={[styles.sectionTitle, { color: C.yellow }]}>Alternativa</Text>
            </View>
            <Text style={styles.sectionText}>{resultado.alternativa}</Text>
          </View>

          {/* Reset */}
          <TouchableOpacity style={styles.resetBtn} onPress={reset}>
            <RotateCcw size={14} color={C.textSub} />
            <Text style={styles.resetText}>Analisar outro produto</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  content: { paddingBottom: 48 },

  header:     { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 60, paddingBottom: 24 },
  headerIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(108,92,231,0.15)', alignItems: 'center', justifyContent: 'center' },
  headerTitle:{ fontSize: 24, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  headerSub:  { fontSize: 13, color: C.textSub, marginTop: 2 },

  card: {
    marginHorizontal: 16, marginBottom: 14,
    backgroundColor: C.surface, borderRadius: 18, padding: 20,
    borderWidth: 1, borderColor: C.border,
  },

  label: { fontSize: 12, fontWeight: '700', color: C.textSub, marginBottom: 8, marginTop: 18, letterSpacing: 0.5, textTransform: 'uppercase' },

  textarea: {
    backgroundColor: C.surface2, borderRadius: 12,
    padding: 14, color: C.text, fontSize: 15,
    borderWidth: 1, borderColor: C.border,
    minHeight: 90, lineHeight: 22,
  },

  persGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  persBtn:      { width: '47.5%', backgroundColor: C.surface2, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border },
  persIconWrap: { width: 32, height: 32, borderRadius: 9, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  persBtnLabel: { fontSize: 13, fontWeight: '800', color: C.text, marginBottom: 2 },
  persBtnDesc:  { fontSize: 11, color: C.textSub, lineHeight: 15 },

  btn:     { borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 22 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 0.2 },

  veredictoBox: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 14, borderWidth: 1, marginBottom: 16 },
  veredictoText:{ fontSize: 15, fontWeight: '800', flex: 1 },

  quoteBox: {
    backgroundColor: C.surface2, borderRadius: 10, padding: 14, marginBottom: 16,
    borderLeftWidth: 3, borderLeftColor: C.brand,
  },
  quoteText: { fontSize: 14, color: C.text, fontStyle: 'italic', lineHeight: 22 },

  section:       { marginBottom: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  sectionTitle:  { fontSize: 12, fontWeight: '700', color: C.textSub, letterSpacing: 0.5, textTransform: 'uppercase' },
  sectionText:   { fontSize: 14, color: C.text, lineHeight: 22 },

  divider: { height: 1, backgroundColor: C.border, marginVertical: 14 },

  resetBtn:  { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: C.border, marginTop: 8 },
  resetText: { fontSize: 13, color: C.textSub, fontWeight: '600' },
});