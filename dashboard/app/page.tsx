'use client';
import { useState, useEffect } from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { motion } from 'framer-motion';
import {
  Brain,
  Cpu,
  Database,
  Clock,
  Server,
  Zap,
  AlertCircle,
  Activity,
  ArrowUpRight,
  Layers,
} from 'lucide-react';
import { API_BASE_URL, getHeaders } from '@/lib/api';
import { HealthMetric } from '@/components/dashboard/HealthMetric';
import { sectorColors } from '@/lib/colors';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
);

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [qpsData, setQpsData] = useState<any[]>([]);
  const [healthMetrics, setHealthMetrics] = useState<any>({});
  const [logs, setLogs] = useState<any[]>([]);
  const [logFilter, setLogFilter] = useState('all');
  const [embedLogs, setEmbedLogs] = useState<any[]>([]);
  const [timePeriod, setTimePeriod] = useState('today');
  const [qpsStats, setQpsStats] = useState<any>({});
  const [maintenanceData, setMaintenanceData] = useState<any[]>([]);
  const [maintenanceStats, setMaintenanceStats] = useState<any>({});
  const [systemHealth, setSystemHealth] = useState<any>({});
  const [backendHealth, setBackendHealth] = useState<any>({});
  const [tierStats, setTierStats] = useState<any>({ hot: 0, warm: 0, cold: 0 });

  useEffect(() => {
    fetchDashboardData();
    fetchBackendHealth();
    const dataInterval = setInterval(fetchDashboardData, 30000);
    const healthInterval = setInterval(fetchBackendHealth, 60000); // 1 minute
    return () => {
      clearInterval(dataInterval);
      clearInterval(healthInterval);
    };
  }, []);

  const fetchDashboardData = async () => {
    try {
      // Fetch dashboard stats
      const statsRes = await fetch(`${API_BASE_URL}/dashboard/stats`, {
        headers: getHeaders(),
      });
      if (statsRes.ok) {
        const stats = await statsRes.json();

        // Update health metrics with comprehensive data
        setHealthMetrics({
          totalMemories: stats.totalMemories || 0,
          avgSalience: parseFloat(stats.avgSalience || 0),
          recentMemories: stats.recentMemories || 0,
          totalRequests: stats.requests?.total || 0,
          errors: stats.requests?.errors || 0,
          errorRate: stats.requests?.errorRate || '0.0',
          compressionRatio: stats.memory?.compressionRatio || 0,
          avgVecDim: stats.memory?.avgVectorDim || 0,
          baseVecDim: stats.memory?.baseVectorDim || 0,
          compressionCoverage: stats.memory?.compressionCoverage || 0,
          compressedCount: stats.memory?.compressedCount || 0,
        });

        // Set QPS stats from backend data
        setQpsStats({
          peakQps: stats.qps?.peak || 0,
          avgQps: stats.qps?.average || 0,
          total: stats.totalMemories || 0,
          errors: stats.requests?.errors || 0,
          cacheHit: stats.qps?.cacheHitRate || 0,
          p50Latency: stats.qps?.latency?.p50 || 0,
          p95Latency: stats.qps?.latency?.p95 || 0,
          p99Latency: stats.qps?.latency?.p99 || 0,
        });

        // Tiered decay distribution
        setTierStats(stats.memory?.tiers || { hot: 0, warm: 0, cold: 0 });

        // Update only config-related system health (preserve health endpoint data)
        const vc = stats.cache?.vecCache || {};
        const vcTotal = (vc.hits || 0) + (vc.misses || 0);
        const vcHitRate =
          vcTotal > 0 ? Math.round(((vc.hits || 0) / vcTotal) * 100) : 0;
        setSystemHealth((prev: any) => ({
          ...prev,
          activeSegments: stats.config?.cacheSegments || 0,
          maxActive: stats.config?.maxActive || 0,
          vecHits: vc.hits || 0,
          vecMisses: vc.misses || 0,
          vecHitRate: vcHitRate || 0,
          vecSize: vc.size || 0,
          vecEvictions: vc.evictions || 0,
          vecTTL: vc.ttl_ms || 0,
          vecMax: vc.max_entries || 0,
        }));
      }

      // Fetch activity logs
      const activityRes = await fetch(
        `${API_BASE_URL}/dashboard/activity?limit=20`,
        {
          headers: getHeaders(),
        },
      );
      if (activityRes.ok) {
        const activity = await activityRes.json();
        setLogs(
          activity.activities?.map((a: any) => ({
            time: new Date(a.timestamp).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false,
            }),
            event: a.type.replace('_', ' '),
            sector: a.sector,
            salience: a.salience?.toFixed(2),
            level:
              a.salience > 0.8
                ? 'Critical'
                : a.salience > 0.5
                ? 'Warning'
                : 'Info',
          })) || [],
        );
      }

      // Fetch embedding logs
      const embedRes = await fetch(
        `${API_BASE_URL}/dashboard/embed-logs?limit=50`,
        { headers: getHeaders() },
      );
      if (embedRes.ok) {
        const data = await embedRes.json();
        setEmbedLogs(
          (data.logs || []).map((e: any) => ({
            time: new Date(e.ts).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false,
            }),
            model: e.model,
            status: e.status,
            op: e.op || '',
            provider: e.provider || '',
            dur: e.duration_ms ?? 0,
            dim: e.output_dim ?? 0,
            code: e.status_code ?? '',
            err: e.err || '',
          })),
        );
      }

      // Fetch sector timeline
      const timelineRes = await fetch(
        `${API_BASE_URL}/dashboard/sectors/timeline?hours=24`,
        {
          headers: getHeaders(),
        },
      );
      if (timelineRes.ok) {
        const timeline = await timelineRes.json();
        const grouped: Record<string, any> = {};

        timeline.timeline?.forEach((item: any) => {
          if (!grouped[item.hour]) {
            grouped[item.hour] = { hour: item.hour };
          }
          grouped[item.hour][item.primary_sector] = item.count;
        });

        const chartData = Object.values(grouped).map((item: any) => ({
          hour: item.hour,
          semantic: item.semantic || 0,
          episodic: item.episodic || 0,
          procedural: item.procedural || 0,
          emotional: item.emotional || 0,
          reflective: item.reflective || 0,
        }));

        setQpsData(chartData);
      }

      // fetch neural maintenance data
      const maintRes = await fetch(
        `${API_BASE_URL}/dashboard/maintenance?hours=24`,
        {
          headers: getHeaders(),
        },
      );
      if (maintRes.ok) {
        const maint = await maintRes.json();
        setMaintenanceData(maint.operations || []);
        setMaintenanceStats(
          maint.totals || {
            cycles: 0,
            reflections: 0,
            consolidations: 0,
            efficiency: 0,
          },
        );
      }

      setLoading(false);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setLoading(false);
    }
  };

  const fetchBackendHealth = async () => {
    try {
      const healthRes = await fetch(`${API_BASE_URL}/dashboard/health`);
      if (healthRes.ok) {
        const health = await healthRes.json();
        setBackendHealth(health);

        // Update system health with real backend data (merge with existing)
        setSystemHealth((prev: any) => ({
          ...prev,
          memoryUsage:
            health.memory?.heapUsed && health.memory?.heapTotal
              ? Math.round(
                  (health.memory.heapUsed / health.memory.heapTotal) * 100,
                )
              : 0,
          heapUsed: health.memory?.heapUsed || 0,
          heapTotal: health.memory?.heapTotal || 0,
          rss: health.memory?.rss || 0,
          external: health.memory?.external || 0,
          uptimeDays: health.uptime?.days || 0,
          uptimeHours: health.uptime?.hours || 0,
          uptimeSeconds: health.uptime?.seconds || 0,
        }));
      }
    } catch (error) {
      console.error('Error fetching backend health:', error);
    }
  };

  const timePeriods = [
    { value: 'today', label: 'Today' },
    { value: '1d', label: '1D' },
    { value: '1w', label: '1W' },
    { value: '1m', label: '1M' },
    { value: '1y', label: '1Y' },
    { value: '5y', label: '5Y' },
    { value: 'max', label: 'All' },
  ];

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="text-center space-y-4">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          >
            <Brain className="w-10 h-10 text-stone-600 mx-auto" />
          </motion.div>
          <div className="text-stone-600 text-sm font-medium tracking-widest uppercase">
            Loading...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 font-sans max-w-7xl mx-auto pb-20">
      {/* Header Section */}
      <div className="flex flex-col gap-1 pt-6">
        <h1 className="text-4xl font-bold tracking-tight text-white bg-clip-text text-transparent bg-gradient-to-r from-white via-stone-200 to-stone-500">
          Overview
        </h1>
        <p className="text-stone-400 text-lg">
          Real-time monitoring of neural architecture and memory systems.
        </p>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between border-b border-white/5 pb-6">
        <div className="flex items-center gap-3">
          <div className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </div>
          <span className="text-sm font-medium text-stone-300">
            System Operational
          </span>
        </div>
        <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 backdrop-blur-sm">
          {timePeriods.map((period) => (
            <button
              key={period.value}
              onClick={() => setTimePeriod(period.value)}
              className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 ${
                timePeriod === period.value
                  ? 'bg-stone-800 text-white shadow-lg shadow-stone-900/50'
                  : 'text-stone-500 hover:text-stone-300 hover:bg-white/5'
              }`}
            >
              {period.label}
            </button>
          ))}
        </div>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Total Memories',
            value: healthMetrics.totalMemories?.toLocaleString() || '0',
            subValue: `+${healthMetrics.recentMemories || 0} recent`,
            icon: Database,
            gradient: 'from-blue-500/20 to-indigo-500/5',
            border: 'border-blue-500/20',
            iconColor: 'text-blue-400',
          },
          {
            label: 'Request Volume',
            value: (healthMetrics.totalRequests || 0).toLocaleString(),
            subValue: `${healthMetrics.errorRate || '0.0'}% error rate`,
            icon: Zap,
            gradient: 'from-amber-500/20 to-orange-500/5',
            border: 'border-amber-500/20',
            iconColor: 'text-amber-400',
          },
          {
            label: 'System Health',
            value: `${(
              100 - parseFloat(healthMetrics.errorRate || '0')
            ).toFixed(1)}%`,
            subValue: `Uptime: ${systemHealth.uptimeDays || 0}d`,
            icon: Activity,
            gradient: 'from-emerald-500/20 to-teal-500/5',
            border: 'border-emerald-500/20',
            iconColor: 'text-emerald-400',
          },
          {
            label: 'Cognitive Load',
            value: `${(healthMetrics.avgSalience || 0).toFixed(2)}`,
            subValue: 'Avg Salience Score',
            icon: Brain,
            gradient: 'from-purple-500/20 to-pink-500/5',
            border: 'border-purple-500/20',
            iconColor: 'text-purple-400',
          },
        ].map((stat, i) => (
          <div
            key={i}
            className={`relative overflow-hidden rounded-3xl border ${stat.border} bg-stone-900/20 backdrop-blur-sm p-6 transition-all duration-300 hover:scale-[1.02] hover:bg-stone-900/40 group`}
          >
            <div
              className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
            />
            <div className="relative flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-stone-400">
                  {stat.label}
                </p>
                <h3 className="text-3xl font-bold text-white mt-2 tracking-tight">
                  {stat.value}
                </h3>
                <p className="text-xs text-stone-500 mt-1 font-medium">
                  {stat.subValue}
                </p>
              </div>
              <div
                className={`p-3 rounded-2xl bg-white/5 border border-white/5 ${stat.iconColor}`}
              >
                <stat.icon className="w-6 h-6" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Secondary Details Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          {
            label: 'Heap Usage',
            value: `${systemHealth.heapUsed || 0}MB`,
            icon: Cpu,
            color: 'text-cyan-400',
          },
          {
            label: 'Compression',
            value: `${healthMetrics.compressionRatio || 0}%`,
            icon: Layers,
            color: 'text-orange-400',
          },
          {
            label: 'Vector Dim',
            value: healthMetrics.avgVecDim || 0,
            icon: ArrowUpRight,
            color: 'text-indigo-400',
          },
          {
            label: 'Coverage',
            value: `${healthMetrics.compressionCoverage || 0}%`,
            icon: Database,
            color: 'text-teal-400',
          },
          {
            label: 'Errors',
            value: healthMetrics.errors || 0,
            icon: AlertCircle,
            color: 'text-red-400',
          },
          {
            label: 'RSS',
            value: `${Math.round((systemHealth.rss || 0) / 1024 / 1024)}MB`,
            icon: Server,
            color: 'text-pink-400',
          },
        ].map((item, i) => (
          <div
            key={i}
            className="flex flex-col p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors"
          >
            <div className="flex items-center gap-2 mb-2">
              <item.icon className={`w-4 h-4 ${item.color}`} />
              <span className="text-xs font-medium text-stone-500">
                {item.label}
              </span>
            </div>
            <span className="text-lg font-semibold text-stone-200">
              {item.value}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-3">
        {[
          {
            label: 'Hot',
            value: tierStats.hot || 0,
            color: 'text-red-400',
            bg: 'bg-red-500/5',
            border: 'border-red-500/10',
          },
          {
            label: 'Warm',
            value: tierStats.warm || 0,
            color: 'text-amber-400',
            bg: 'bg-amber-500/5',
            border: 'border-amber-500/10',
          },
          {
            label: 'Cold',
            value: tierStats.cold || 0,
            color: 'text-blue-400',
            bg: 'bg-blue-500/5',
            border: 'border-blue-500/10',
          },
        ].map((t) => (
          <div
            key={t.label}
            className={`p-3 rounded-xl border ${t.border} ${t.bg} bg-opacity-20`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`w-2 h-2 rounded-full ${t.bg.replace('/5', '')}`}
              />
              <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">
                {t.label} Tier
              </span>
            </div>
            <div className="text-lg font-bold text-stone-200 font-mono">
              {t.value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-6 mb-6">
        {}
        <div className="bg-transparent rounded-xl p-6 border border-[#27272a] hover:border-zinc-600 transition-colors duration-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-[#f4f4f5]">
              Memory Query Load
            </h2>
            <div className="flex gap-2">
              <select className="rounded-xl p-2 pl-4 border border-stone-800 bg-stone-950 hover:bg-stone-900/50 hover:text-stone-300 text-sm font-medium text-stone-400 outline-none cursor-pointer transition-colors">
                <option className="bg-stone-950">24 hours</option>
                <option className="bg-stone-950">7 days</option>
                <option className="bg-stone-950">30 days</option>
              </select>
            </div>
          </div>
          <div style={{ height: '280px' }}>
            <Bar
              data={{
                labels: qpsData.map((d) => d.hour),
                datasets: [
                  {
                    label: 'Semantic',
                    data: qpsData.map((d) => d.semantic),
                    backgroundColor: 'rgba(248, 113, 113, 0.7)',
                    borderColor: 'rgba(248, 113, 113, 1)',
                    borderWidth: 0,
                  },
                  {
                    label: 'Episodic',
                    data: qpsData.map((d) => d.episodic),
                    backgroundColor: 'rgba(251, 191, 36, 0.7)',
                    borderColor: 'rgba(251, 191, 36, 1)',
                    borderWidth: 0,
                  },
                  {
                    label: 'Procedural',
                    data: qpsData.map((d) => d.procedural),
                    backgroundColor: 'rgba(52, 211, 153, 0.7)',
                    borderColor: 'rgba(52, 211, 153, 1)',
                    borderWidth: 0,
                  },
                  {
                    label: 'Emotional',
                    data: qpsData.map((d) => d.emotional),
                    backgroundColor: 'rgba(96, 165, 250, 0.7)',
                    borderColor: 'rgba(96, 165, 250, 1)',
                    borderWidth: 0,
                  },
                  {
                    label: 'Reflective',
                    data: qpsData.map((d) => d.reflective),
                    backgroundColor: 'rgba(192, 132, 252, 0.7)',
                    borderColor: 'rgba(192, 132, 252, 1)',
                    borderWidth: 0,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                  mode: 'index',
                  intersect: false,
                },
                scales: {
                  x: {
                    stacked: true,
                    grid: {
                      color: '#2a2a2a',
                    },
                    ticks: {
                      color: '#9ca3af',
                      font: { size: 11 },
                    },
                  },
                  y: {
                    stacked: true,
                    grid: {
                      color: '#2a2a2a',
                    },
                    ticks: {
                      color: '#9ca3af',
                      font: { size: 11 },
                    },
                  },
                },
                plugins: {
                  legend: {
                    display: false,
                  },
                  tooltip: {
                    backgroundColor: '#111111',
                    borderColor: '#52525b',
                    borderWidth: 1,
                    titleColor: '#e6e6e6',
                    bodyColor: '#e6e6e6',
                    padding: 12,
                    displayColors: true,
                    boxWidth: 12,
                    boxHeight: 12,
                    boxPadding: 4,
                  },
                },
              }}
            />
          </div>
          <div className="flex gap-3 text-xs text-[#8a8a8a] mt-4 pt-4 border-t border-[#27272a] hover:border-zinc-600 transition-colors duration-200">
            <div className="flex items-center gap-1">
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: sectorColors.semantic }}
              />
              semantic
            </div>
            <div className="flex items-center gap-1">
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: sectorColors.episodic }}
              />
              episodic
            </div>
            <div className="flex items-center gap-1">
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: sectorColors.procedural }}
              />
              procedural
            </div>
            <div className="flex items-center gap-1">
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: sectorColors.emotional }}
              />
              emotional
            </div>
            <div className="flex items-center gap-1">
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: sectorColors.reflective }}
              />
              reflective
            </div>
          </div>
          <div className="grid grid-cols-5 gap-2 mt-4">
            <div className="bg-transparent rounded p-2 border border-[#27272a] hover:border-zinc-600 transition-colors duration-200 text-center">
              <p className="text-xs text-[#8a8a8a] mb-1">Peak QPS</p>
              <p className="text-lg font-bold text-[#f4f4f5]">
                {qpsStats.peakQps || 0}
              </p>
            </div>
            <div className="bg-transparent rounded p-2 border border-[#27272a] hover:border-zinc-600 transition-colors duration-200 text-center">
              <p className="text-xs text-[#8a8a8a] mb-1">Avg QPS</p>
              <p className="text-lg font-bold text-[#f4f4f5]">
                {qpsStats.avgQps || 0}
              </p>
            </div>
            <div className="bg-transparent rounded p-2 border border-[#27272a] hover:border-zinc-600 transition-colors duration-200 text-center">
              <p className="text-xs text-[#8a8a8a] mb-1">Total</p>
              <p className="text-lg font-bold text-[#f4f4f5]">
                {(qpsStats.total || 0).toLocaleString()}k
              </p>
            </div>
            <div className="bg-transparent rounded p-2 border border-[#27272a] hover:border-zinc-600 transition-colors duration-200 text-center">
              <p className="text-xs text-[#8a8a8a] mb-1">Errors</p>
              <p className="text-lg font-bold text-[#f87171]">
                {qpsStats.errors || 0}
              </p>
            </div>
            <div className="bg-transparent rounded p-2 border border-[#27272a] hover:border-zinc-600 transition-colors duration-200 text-center">
              <p className="text-xs text-[#8a8a8a] mb-1">Cache Hit</p>
              <p className="text-lg font-bold text-[#22c55e]">
                {qpsStats.cacheHit || 0}%
              </p>
            </div>
            <div className="bg-transparent rounded p-2 border border-[#27272a] hover:border-zinc-600 transition-colors duration-200 text-center">
              <p className="text-xs text-[#8a8a8a] mb-1">p50 Latency</p>
              <p className="text-lg font-bold text-[#22d3ee]">
                {qpsStats.p50Latency || 0} ms
              </p>
            </div>
            <div className="bg-transparent rounded p-2 border border-[#27272a] hover:border-zinc-600 transition-colors duration-200 text-center">
              <p className="text-xs text-[#8a8a8a] mb-1">p95 Latency</p>
              <p className="text-lg font-bold text-[#fbbf24]">
                {qpsStats.p95Latency || 0} ms
              </p>
            </div>
            <div className="bg-transparent rounded p-2 border border-[#27272a] hover:border-zinc-600 transition-colors duration-200 text-center">
              <p className="text-xs text-[#8a8a8a] mb-1">p99 Latency</p>
              <p className="text-lg font-bold text-[#f43f5e]">
                {qpsStats.p99Latency || 0} ms
              </p>
            </div>
          </div>
        </div>

        {}
        <div className="bg-transparent rounded-xl p-6 border border-[#27272a] hover:border-zinc-600 transition-colors duration-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-[#f4f4f5]">
              Neural Maintenance
            </h2>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
              <span className="text-xs text-[#8a8a8a]">Active</span>
            </div>
          </div>
          <div style={{ height: '280px' }}>
            <Bar
              data={{
                labels: maintenanceData.map((d) => d.hour),
                datasets: [
                  {
                    label: 'Decay Cycles',
                    data: maintenanceData.map((d) => d.decay),
                    backgroundColor: 'rgba(34,197,94,0.5)',
                    borderColor: 'rgba(34,197,94,1)',
                    borderWidth: 0,
                  },
                  {
                    label: 'Decay Hot',
                    data: maintenanceData.map((d) => d.decay_hot || 0),
                    backgroundColor: 'rgba(248,113,113,0.5)',
                    borderColor: 'rgba(248,113,113,1)',
                    borderWidth: 0,
                  },
                  {
                    label: 'Decay Warm',
                    data: maintenanceData.map((d) => d.decay_warm || 0),
                    backgroundColor: 'rgba(251,191,36,0.5)',
                    borderColor: 'rgba(251,191,36,1)',
                    borderWidth: 0,
                  },
                  {
                    label: 'Decay Cold',
                    data: maintenanceData.map((d) => d.decay_cold || 0),
                    backgroundColor: 'rgba(96,165,250,0.5)',
                    borderColor: 'rgba(96,165,250,1)',
                    borderWidth: 0,
                  },
                  {
                    label: 'Prune Weak',
                    data: maintenanceData.map((d) => d.prune_weak || 0),
                    backgroundColor: 'rgba(244,63,94,0.5)',
                    borderColor: 'rgba(244,63,94,1)',
                    borderWidth: 0,
                  },
                  {
                    label: 'Prune Old',
                    data: maintenanceData.map((d) => d.prune_old || 0),
                    backgroundColor: 'rgba(234,88,12,0.5)',
                    borderColor: 'rgba(234,88,12,1)',
                    borderWidth: 0,
                  },
                  {
                    label: 'Prune Dense',
                    data: maintenanceData.map((d) => d.prune_dense || 0),
                    backgroundColor: 'rgba(59,130,246,0.5)',
                    borderColor: 'rgba(59,130,246,1)',
                    borderWidth: 0,
                  },
                  {
                    label: 'Compression',
                    data: maintenanceData.map((d) => d.compression || 0),
                    backgroundColor: 'rgba(234,179,8,0.5)',
                    borderColor: 'rgba(234,179,8,1)',
                    borderWidth: 0,
                  },
                  {
                    label: 'Fingerprint',
                    data: maintenanceData.map((d) => d.fingerprint || 0),
                    backgroundColor: 'rgba(99,102,241,0.5)',
                    borderColor: 'rgba(99,102,241,1)',
                    borderWidth: 0,
                  },
                  {
                    label: 'Regeneration',
                    data: maintenanceData.map((d) => d.regenerate || 0),
                    backgroundColor: 'rgba(45,212,191,0.5)',
                    borderColor: 'rgba(45,212,191,1)',
                    borderWidth: 0,
                  },
                  {
                    label: 'Reinforce',
                    data: maintenanceData.map((d) => d.reinforce || 0),
                    backgroundColor: 'rgba(168,85,247,0.5)',
                    borderColor: 'rgba(168,85,247,1)',
                    borderWidth: 0,
                  },
                  {
                    label: 'Reflections',
                    data: maintenanceData.map((d) => d.reflection),
                    backgroundColor: 'rgba(96,165,250,0.7)',
                    borderColor: 'rgba(96,165,250,1)',
                    borderWidth: 0,
                  },
                  {
                    label: 'Consolidations',
                    data: maintenanceData.map((d) => d.consolidation),
                    backgroundColor: 'rgba(192,132,252,0.7)',
                    borderColor: 'rgba(192,132,252,1)',
                    borderWidth: 0,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                  mode: 'index',
                  intersect: false,
                },
                scales: {
                  x: {
                    grid: {
                      color: '#2a2a2a',
                    },
                    ticks: {
                      color: '#9ca3af',
                      font: { size: 11 },
                    },
                  },
                  y: {
                    grid: {
                      color: '#2a2a2a',
                    },
                    ticks: {
                      color: '#9ca3af',
                      font: { size: 11 },
                    },
                  },
                },
                plugins: {
                  legend: {
                    display: false,
                  },
                  tooltip: {
                    backgroundColor: '#111111',
                    borderColor: '#52525b',
                    borderWidth: 1,
                    titleColor: '#e6e6e6',
                    bodyColor: '#e6e6e6',
                    padding: 12,
                    displayColors: true,
                    boxWidth: 12,
                    boxHeight: 12,
                    boxPadding: 4,
                  },
                },
              }}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            {/* Activity & Efficiency */}
            <div className="p-4 rounded-xl bg-stone-900/30 border border-white/5">
              <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Activity className="w-3 h-3" /> Activity
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-stone-500">Cycles</span>
                  <span className="text-stone-200 font-mono font-medium">
                    {maintenanceStats.cycles || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-stone-500">Efficiency</span>
                  <span className="text-emerald-400 font-mono font-bold">
                    {maintenanceStats.efficiency || 0}%
                  </span>
                </div>
              </div>
            </div>

            {/* Tier Decay */}
            <div className="p-4 rounded-xl bg-stone-900/30 border border-white/5">
              <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Clock className="w-3 h-3" /> Decay Ops
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-stone-500">Hot Tier</span>
                  <span className="text-red-400 font-mono">
                    {maintenanceStats.cycles_by_tier?.hot || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-stone-500">Warm Tier</span>
                  <span className="text-amber-400 font-mono">
                    {maintenanceStats.cycles_by_tier?.warm || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-stone-500">Cold Tier</span>
                  <span className="text-blue-400 font-mono">
                    {maintenanceStats.cycles_by_tier?.cold || 0}
                  </span>
                </div>
              </div>
            </div>

            {/* Pruning Stats */}
            <div className="p-4 rounded-xl bg-stone-900/30 border border-white/5">
              <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <AlertCircle className="w-3 h-3" /> Pruning
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-stone-500">Weak</span>
                  <span className="text-rose-400 font-mono">
                    {maintenanceStats.prunes?.weak || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-stone-500">Old</span>
                  <span className="text-orange-400 font-mono">
                    {maintenanceStats.prunes?.old || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-stone-500">Dense</span>
                  <span className="text-blue-500 font-mono">
                    {maintenanceStats.prunes?.dense || 0}
                  </span>
                </div>
              </div>
            </div>

            {/* Optimization */}
            <div className="p-4 rounded-xl bg-stone-900/30 border border-white/5">
              <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Zap className="w-3 h-3" /> Optimization
              </h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div>
                  <div className="text-[10px] text-stone-500">Compress</div>
                  <div className="text-yellow-400 font-mono">
                    {maintenanceStats.compression || 0}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-stone-500">Fingerprint</div>
                  <div className="text-indigo-400 font-mono">
                    {maintenanceStats.fingerprints || 0}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-stone-500">Regen</div>
                  <div className="text-teal-400 font-mono">
                    {maintenanceStats.regenerations || 0}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-stone-500">Reinforce</div>
                  <div className="text-purple-400 font-mono">
                    {maintenanceStats.reinforcements || 0}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {}
      {/* System Health Section */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Memory Resources */}
        <div className="p-5 rounded-xl bg-stone-900/30 border border-white/5 backdrop-blur-sm hover:bg-stone-900/40 transition-colors">
          <h3 className="text-sm font-semibold text-stone-300 mb-4 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" /> Memory Resources
          </h3>
          <div className="flex flex-col gap-4">
            {/* Progress Bar for Heap */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-stone-500">Heap Usage</span>
                <span className="text-stone-300">
                  {systemHealth.memoryUsage || 0}%
                </span>
              </div>
              <div className="h-2 w-full bg-stone-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-500 rounded-full transition-all duration-500"
                  style={{ width: `${systemHealth.memoryUsage || 0}%` }}
                />
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 rounded-lg bg-black/20">
                <div className="text-stone-500 mb-1">Heap Used</div>
                <div className="text-stone-200 font-mono">
                  {systemHealth.heapUsed || 0} MB
                </div>
              </div>
              <div className="p-2 rounded-lg bg-black/20">
                <div className="text-stone-500 mb-1">Total</div>
                <div className="text-stone-200 font-mono">
                  {systemHealth.heapTotal || 0} MB
                </div>
              </div>
              <div className="p-2 rounded-lg bg-black/20">
                <div className="text-stone-500 mb-1">RSS</div>
                <div className="text-stone-200 font-mono">
                  {systemHealth.rss || 0} MB
                </div>
              </div>
              <div className="p-2 rounded-lg bg-black/20">
                <div className="text-stone-500 mb-1">External</div>
                <div className="text-stone-200 font-mono">
                  {systemHealth.external || 0} MB
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Vector Cache */}
        <div className="p-5 rounded-xl bg-stone-900/30 border border-white/5 backdrop-blur-sm hover:bg-stone-900/40 transition-colors">
          <h3 className="text-sm font-semibold text-stone-300 mb-4 flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-400" /> Vector Cache
          </h3>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <span className="text-xs text-emerald-300 font-medium">
                Hit Rate
              </span>
              <span className="text-xl font-bold text-emerald-400">
                {systemHealth.vecHitRate || 0}%
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs text-stone-500 border-b border-white/5 pb-2">
                <span>Hits / Misses</span>
                <span className="text-stone-300 font-mono">
                  {systemHealth.vecHits || 0} / {systemHealth.vecMisses || 0}
                </span>
              </div>
              <div className="flex justify-between text-xs text-stone-500 border-b border-white/5 pb-2">
                <span>Entries</span>
                <span className="text-stone-300 font-mono">
                  {systemHealth.vecSize || 0} / {systemHealth.vecMax || 0}
                </span>
              </div>
              <div className="flex justify-between text-xs text-stone-500 border-b border-white/5 pb-2">
                <span>Evictions</span>
                <span className="text-amber-400 font-mono">
                  {systemHealth.vecEvictions || 0}
                </span>
              </div>
              <div className="flex justify-between text-xs text-stone-500 pt-1">
                <span>TTL</span>
                <span className="text-stone-300 font-mono">
                  {Math.round((systemHealth.vecTTL || 0) / 1000)}s
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* System Info */}
        <div className="p-5 rounded-xl bg-stone-900/30 border border-white/5 backdrop-blur-sm hover:bg-stone-900/40 transition-colors">
          <h3 className="text-sm font-semibold text-stone-300 mb-4 flex items-center gap-2">
            <Server className="w-4 h-4 text-indigo-400" /> Environment
          </h3>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-500/10">
                <Clock className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <div className="text-[10px] text-stone-500 uppercase tracking-wider">
                  Uptime
                </div>
                <div className="text-sm font-medium text-stone-200">
                  {systemHealth.uptimeDays || 0}d {systemHealth.uptimeHours || 0}
                  h
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5">
              <div>
                <div className="text-[10px] text-stone-500 mb-1">Platform</div>
                <div className="text-xs text-stone-300 bg-black/20 px-2 py-1 rounded border border-white/5">
                  {backendHealth.process?.platform || 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-stone-500 mb-1">
                  Node Version
                </div>
                <div className="text-xs text-stone-300 bg-black/20 px-2 py-1 rounded border border-white/5">
                  {backendHealth.process?.version || 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-stone-500 mb-1">PID</div>
                <div className="text-xs text-stone-300 bg-black/20 px-2 py-1 rounded border border-white/5 font-mono">
                  {backendHealth.process?.pid || 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-stone-500 mb-1">Status</div>
                <div className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Active
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Memory & System Logs */}
        <div className="bg-stone-900/30 rounded-xl border border-white/5 backdrop-blur-sm overflow-hidden flex flex-col h-[500px]">
          <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
            <h2 className="text-sm font-semibold text-stone-200 flex items-center gap-2">
              <Database className="w-4 h-4 text-stone-400" />
              Memory Logs
            </h2>
          </div>
          
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-white/[0.02] sticky top-0 z-10 backdrop-blur-md">
                <tr>
                  <th className="py-3 px-4 text-xs font-medium text-stone-500 w-24">Time</th>
                  <th className="py-3 px-4 text-xs font-medium text-stone-500">Event</th>
                  <th className="py-3 px-4 text-xs font-medium text-stone-500 w-24">Sector</th>
                  <th className="py-3 px-4 text-xs font-medium text-stone-500 w-20 text-right">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {logs.length > 0 ? (
                  logs.map((log, idx) => (
                    <tr key={idx} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="py-3 px-4 text-xs text-stone-500 font-mono group-hover:text-stone-400">
                        {log.time}
                      </td>
                      <td className="py-3 px-4 text-sm text-stone-300">
                        {log.event}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-stone-800 text-stone-400 border border-stone-700">
                          {log.sector}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span
                          className={`font-mono text-xs font-bold ${
                            log.level === 'Critical'
                              ? 'text-red-400'
                              : log.level === 'Warning'
                              ? 'text-amber-400'
                              : 'text-stone-500'
                          }`}
                        >
                          {log.salience}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-stone-500 text-sm">
                      No activity logs yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Activity Feed */}
        <div className="bg-stone-900/30 rounded-xl border border-white/5 backdrop-blur-sm overflow-hidden flex flex-col h-[500px]">
          <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
            <h2 className="text-sm font-semibold text-stone-200 flex items-center gap-2">
              <Activity className="w-4 h-4 text-stone-400" />
              Recent Activity
            </h2>
            <div className="flex gap-2">
              <select
                value={logFilter}
                onChange={(e) => setLogFilter(e.target.value)}
                className="bg-black/20 border border-white/10 rounded-lg px-3 py-1 text-xs text-stone-400 focus:outline-none focus:border-stone-500 transition-colors"
              >
                <option value="all">All Levels</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto p-4 space-y-3">
            {logs
              .filter((log) =>
                logFilter === 'all'
                  ? true
                  : log.level.toLowerCase() === logFilter.toLowerCase(),
              )
              .length > 0 ? (
              logs
                .filter((log) =>
                  logFilter === 'all'
                    ? true
                    : log.level.toLowerCase() === logFilter.toLowerCase(),
                )
                .slice(0, 15)
                .map((log, idx) => (
                  <div
                    key={idx}
                    className="relative pl-4 py-1 border-l-2 border-stone-800 hover:border-stone-600 transition-colors"
                  >
                  <div className="flex justify-between items-start mb-0.5">
                    <span className="text-sm font-medium text-stone-200">
                      {log.event}
                    </span>
                    <span className="text-[10px] text-stone-500 font-mono">
                      {log.time}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-stone-500">
                      Sector: <span className="text-stone-400">{log.sector}</span>
                    </span>
                    <span className="text-stone-500">
                      Impact: {' '}
                      <span
                        className={
                          log.level === 'Critical'
                            ? 'text-red-400'
                            : log.level === 'Warning'
                            ? 'text-amber-400'
                            : 'text-stone-400'
                        }
                      >
                        {log.level}
                      </span>
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center text-stone-500 py-8 text-sm">
                No recent activity
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Embedding Logs Table */}
      <div className="bg-stone-900/30 rounded-xl border border-white/5 backdrop-blur-sm overflow-hidden">
        <div className="p-6 border-b border-white/5 bg-white/[0.02]">
          <h2 className="text-sm font-semibold text-stone-200 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-stone-400" />
            Embedding Operations
          </h2>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead className="bg-white/[0.02]">
              <tr>
                {['Time', 'Model', 'Status', 'Operation', 'Provider', 'Duration', 'Dim', 'Code', 'Error'].map((h) => (
                  <th key={h} className="py-3 px-4 text-xs font-medium text-stone-500 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {embedLogs.length > 0 ? (
                embedLogs.map((e, idx) => (
                  <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-4 text-xs text-stone-500 font-mono">{e.time}</td>
                    <td className="py-3 px-4 text-xs text-stone-300 font-medium">{e.model}</td>
                    <td className="py-3 px-4 text-xs">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        e.status === 'success' 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                          : 'bg-red-500/10 text-red-400 border border-red-500/20'
                      }`}>
                        {e.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-stone-400">{e.op}</td>
                    <td className="py-3 px-4 text-xs text-stone-400">{e.provider}</td>
                    <td className="py-3 px-4 text-xs text-stone-400 font-mono">{e.dur}ms</td>
                    <td className="py-3 px-4 text-xs text-stone-500 font-mono">{e.dim}</td>
                    <td className="py-3 px-4 text-xs text-stone-500 font-mono">{e.code}</td>
                    <td className="py-3 px-4 text-xs text-red-400 max-w-[200px] truncate" title={e.err}>
                      {e.err}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-stone-500 text-sm">
                    No embedding logs available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
