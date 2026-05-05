export type DeviceMetricGroup = "SYSTEM" | "DISK" | "NET";

export type DeviceMetricSample = {
  metricGroup: DeviceMetricGroup;
  metricKey: string;
  instance?: string;
  value: number;
  unit: string;
};
