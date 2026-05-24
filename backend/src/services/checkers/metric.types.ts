export type DeviceMetricGroup = "SYSTEM" | "DISK" | "NET" | "PRINTER";

export type DeviceMetricSample = {
  metricGroup: DeviceMetricGroup;
  metricKey: string;
  instance?: string;
  value: number;
  unit: string;
};
