import React, { useState } from "react";
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import {
  Activity,
  BarChart3,
  BookOpen,
  Box,
  Brain,
  Check,
  ClipboardList,
  Cpu,
  Database,
  Eye,
  FileText,
  Home,
  Layers,
  MessageSquare,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  UsersRound
} from "lucide-react-native";

const pages = [
  { id: "pipeline", label: "Pipeline", icon: Activity },
  { id: "knowledge", label: "Knowledge", icon: BookOpen },
  { id: "new", label: "New Design", icon: Home },
  { id: "explore", label: "Explore", icon: Search },
  { id: "cad", label: "CAD", icon: Box }
];

const sources = [
  ["Biomedical Literature", "13,254", BookOpen],
  ["Clinical Guidelines", "1,246", ClipboardList],
  ["Engineering Standards", "3,652", ShieldCheck],
  ["Device Specifications", "2,915", Cpu],
  ["Human Factors Guidance", "1,186", UserRound],
  ["Digital Health Architectures", "4,378", Layers]
];

export default function App() {
  const [active, setActive] = useState("pipeline");
  const screen = {
    pipeline: <Pipeline />,
    knowledge: <Knowledge />,
    new: <NewDesign />,
    explore: <Explore />,
    cad: <Cad />
  }[active];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Box color="#1786ff" size={34} />
        <View style={{ flex: 1 }}>
          <Text style={styles.brand}>Smart Health by Design</Text>
          <Text style={styles.subbrand}>AI-Powered Design Co-Pilot</Text>
        </View>
        <View style={styles.avatar}><Text style={styles.avatarText}>JT</Text></View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={{ gap: 8 }}>
        {pages.map((page) => {
          const Icon = page.icon;
          const selected = active === page.id;
          return (
            <TouchableOpacity key={page.id} style={[styles.tab, selected && styles.tabActive]} onPress={() => setActive(page.id)}>
              <Icon color="#dce7f1" size={16} />
              <Text style={styles.tabText}>{page.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <ScrollView style={styles.body}>{screen}</ScrollView>
    </SafeAreaView>
  );
}

function Pipeline() {
  const steps = [
    ["1", "Retrieval-Grounded Generative Reasoning", BookOpen],
    ["2", "Multimodal Human Feedback Integration", UsersRound],
    ["3", "Explainable Design Synthesis", Brain],
    ["4", "Natural Language Development", MessageSquare]
  ];
  return (
    <View>
      <Title title="AI-Driven Pipeline" subtitle="Placeholder overview for evidence-grounded biomedical innovation." />
      {steps.map(([num, title, Icon]) => (
        <Card key={title}>
          <View style={styles.stepRow}><Text style={styles.badge}>{num}</Text><Text style={styles.cardTitle}>{title}</Text></View>
          <Text style={styles.copy}>Placeholder text describing this stage and its role in the design pipeline.</Text>
          <View style={styles.iconRow}><Icon color="#08c9d6" size={36} /><BarChart3 color="#41c96b" size={36} /></View>
          <List items={["Placeholder source", "Placeholder reasoning", "Placeholder output"]} />
        </Card>
      ))}
      <Panel title="Continuous Learning" icon={Database} items={["Real-world data", "Performance feedback", "Knowledge update", "Better decisions"]} />
      <Panel title="Trust and Transparency" icon={ShieldCheck} items={["RAG lookup", "Audit trail", "Human-in-the-loop", "CoT reasoning"]} />
    </View>
  );
}

function Knowledge() {
  return (
    <View>
      <Title title="Knowledge Sources" subtitle="Curated placeholder knowledge cards and source analytics." />
      <Card>
        <Text style={styles.metricBig}>26,631</Text>
        <Text style={styles.copy}>Total sources across 6 categories</Text>
        <View style={styles.donut}><Text style={styles.donutText}>Hub</Text></View>
      </Card>
      {sources.map(([title, count, Icon]) => (
        <Card key={title}>
          <Icon color="#08c9d6" size={40} />
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.copy}>Placeholder summary of source coverage, quality, and update cadence.</Text>
          <List items={["Placeholder repository", "Placeholder guideline", `${count} sources`]} />
        </Card>
      ))}
    </View>
  );
}

function NewDesign() {
  return (
    <View>
      <Title title="Welcome to Smart Health by Design" subtitle="Describe your design goal and explore placeholder health solutions." />
      {["CAD Design", "Mobile App Design", "Both CAD & Mobile App"].map((item) => (
        <Card key={item}>
          <Text style={styles.cardTitle}>{item}</Text>
          <Text style={styles.copy}>Placeholder description for this design mode.</Text>
        </Card>
      ))}
      <Card>
        <View style={styles.stepRow}><Sparkles color="#52b9ff" size={24} /><Text style={styles.cardTitle}>Example Prompt</Text></View>
        <Text style={styles.copy}>"Placeholder prompt describing a smart health product concept."</Text>
      </Card>
      <View style={styles.composer}><MessageSquare color="#2f85ff" /><Text style={styles.composerText}>Describe a placeholder design goal...</Text><Send color="#2f85ff" /></View>
    </View>
  );
}

function Explore() {
  return (
    <View>
      <Title title="RAG Design Exploration" subtitle="Placeholder evidence synthesis and design option comparison." />
      <Panel title="Filters & Constraints" icon={SlidersHorizontal} items={["Design goals", "Performance", "Usability", "Safety", "Cost"]} />
      {["Option A - Full-Palate Retainer", "Option B - Adaptive Fit Mouthguard"].map((title) => (
        <Card key={title}>
          <Text style={styles.cardTitle}>{title}</Text>
          <View style={styles.mouthguard} />
          <List items={["Placeholder evidence point", "Placeholder trade-off", "Placeholder usability note"]} />
        </Card>
      ))}
      <Panel title="Rationale & Evidence" icon={FileText} items={["Biomedical placeholder", "Clinical placeholder", "Engineering placeholder", "Stakeholder placeholder"]} />
      <Chat />
      <Primary label="Proceed to CAD Design" />
    </View>
  );
}

function Cad() {
  return (
    <View>
      <Title title="CAD Workspace" subtitle="Layered placeholder model and generative design explanation." />
      <Panel title="Model Layers" icon={Layers} items={["Flexible PCB", "PPG Sensors", "Temp Sensors", "Battery Module", "Biomaterial Casing"]} />
      <Card>
        <View style={styles.toolbar}><Eye color="#dce7f1" /><Search color="#dce7f1" /><Box color="#dce7f1" /><Layers color="#dce7f1" /></View>
        <View style={styles.model}><View style={styles.modelArc} /><View style={styles.modelArcSmall} /><Text style={styles.copy}>3D Placeholder Model</Text></View>
      </Card>
      {["Physiologic Constraints", "Hardware Constraints", "Software Constraints"].map((title) => (
        <Card key={title}><Text style={styles.cardTitle}>{title}</Text><Text style={styles.copy}>Placeholder justification explaining impact, constraints, and design evidence.</Text></Card>
      ))}
      <Chat />
      <Primary label="Proceed to Prototype" />
    </View>
  );
}

function Title({ title, subtitle }) {
  return <View style={styles.titleBlock}><Text style={styles.title}>{title}</Text><Text style={styles.copy}>{subtitle}</Text></View>;
}

function Card({ children }) {
  return <View style={styles.card}>{children}</View>;
}

function Panel({ title, icon: Icon, items }) {
  return <Card><View style={styles.stepRow}><Icon color="#52b9ff" size={22} /><Text style={styles.cardTitle}>{title}</Text></View><List items={items} /></Card>;
}

function List({ items }) {
  return <View style={{ marginTop: 10 }}>{items.map((item) => <View style={styles.listRow} key={item}><Check color="#41c96b" size={15} /><Text style={styles.listText}>{item}</Text></View>)}</View>;
}

function Chat() {
  return <Card><Text style={styles.cardTitle}>AI Co-Pilot</Text>{["Placeholder assistant update.", "Placeholder user instruction.", "Placeholder response."].map((msg, idx) => <Text key={msg} style={[styles.bubble, idx === 1 && styles.userBubble]}>{msg}</Text>)}</Card>;
}

function Primary({ label }) {
  return <TouchableOpacity style={styles.primary}><Text style={styles.primaryText}>{label}</Text></TouchableOpacity>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#020b12" },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: 16, borderBottomWidth: 1, borderBottomColor: "rgba(72,140,190,.22)" },
  brand: { color: "#f3f7fb", fontSize: 20, fontWeight: "800" },
  subbrand: { color: "#08c9d6", marginTop: 2 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#0b1c2c", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontWeight: "800" },
  tabs: { maxHeight: 58, paddingHorizontal: 12, paddingVertical: 8 },
  tab: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 13, height: 40, borderRadius: 8, borderWidth: 1, borderColor: "rgba(72,140,190,.22)", backgroundColor: "#061826" },
  tabActive: { backgroundColor: "#073da8" },
  tabText: { color: "#dce7f1", fontWeight: "700" },
  body: { paddingHorizontal: 14 },
  titleBlock: { paddingTop: 14, paddingBottom: 8 },
  title: { color: "#f3f7fb", fontSize: 28, fontWeight: "900", marginBottom: 8 },
  copy: { color: "#a8b7c7", lineHeight: 21 },
  card: { backgroundColor: "#071a29", borderWidth: 1, borderColor: "rgba(72,140,190,.25)", borderRadius: 8, padding: 16, marginBottom: 12 },
  cardTitle: { color: "#f3f7fb", fontSize: 19, fontWeight: "800", flex: 1 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  badge: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#073da8", color: "#fff", textAlign: "center", lineHeight: 38, fontWeight: "900", fontSize: 20 },
  iconRow: { flexDirection: "row", gap: 26, marginVertical: 14 },
  listRow: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: "rgba(130,180,215,.08)" },
  listText: { color: "#dce7f1", flex: 1 },
  metricBig: { color: "#f3f7fb", fontSize: 42, fontWeight: "900" },
  donut: { alignSelf: "center", width: 140, height: 140, borderRadius: 70, borderWidth: 22, borderColor: "#08c9d6", alignItems: "center", justifyContent: "center", marginTop: 14 },
  donutText: { color: "#f3f7fb", fontWeight: "900" },
  composer: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 74, padding: 16, borderRadius: 8, borderWidth: 1, borderColor: "#1463ff", backgroundColor: "#071a29", marginBottom: 22 },
  composerText: { color: "#dce7f1", flex: 1 },
  mouthguard: { height: 120, marginVertical: 12, borderBottomWidth: 16, borderLeftWidth: 16, borderRightWidth: 16, borderColor: "rgba(255,255,255,.45)", borderBottomLeftRadius: 80, borderBottomRightRadius: 80 },
  bubble: { color: "#dce7f1", backgroundColor: "#10283a", padding: 12, borderRadius: 6, marginTop: 8 },
  userBubble: { backgroundColor: "#073da8", marginLeft: 36 },
  primary: { backgroundColor: "#0d58ea", borderRadius: 8, padding: 16, alignItems: "center", marginBottom: 28 },
  primaryText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  toolbar: { flexDirection: "row", gap: 20, marginBottom: 20 },
  model: { minHeight: 260, alignItems: "center", justifyContent: "center", backgroundColor: "#091a26", borderRadius: 8 },
  modelArc: { width: 230, height: 120, borderBottomWidth: 20, borderLeftWidth: 20, borderRightWidth: 20, borderColor: "rgba(246,201,59,.55)", borderBottomLeftRadius: 110, borderBottomRightRadius: 110 },
  modelArcSmall: { position: "absolute", width: 170, height: 86, borderBottomWidth: 12, borderLeftWidth: 12, borderRightWidth: 12, borderColor: "rgba(255,255,255,.3)", borderBottomLeftRadius: 80, borderBottomRightRadius: 80 }
});
