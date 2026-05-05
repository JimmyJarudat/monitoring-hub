import * as snmp from "net-snmp";

export const IFACE_OIDS = {
  ifDescr: "1.3.6.1.2.1.2.2.1.2",
  ifOperStatus: "1.3.6.1.2.1.2.2.1.8",
  ifInOctets: "1.3.6.1.2.1.2.2.1.10",
  ifOutOctets: "1.3.6.1.2.1.2.2.1.16",
  ifInDiscards: "1.3.6.1.2.1.2.2.1.13",
  ifInErrors: "1.3.6.1.2.1.2.2.1.14",
  ifOutDiscards: "1.3.6.1.2.1.2.2.1.19",
  ifOutErrors: "1.3.6.1.2.1.2.2.1.20",
  ifHCInOctets: "1.3.6.1.2.1.31.1.1.1.6",
  ifHCOutOctets: "1.3.6.1.2.1.31.1.1.1.10",
} as const;

export const snmpVersion = (value?: string) =>
  value === "1" ? snmp.Version1 : snmp.Version2c;

export const snmpGet = (
  session: snmp.Session,
  oids: string[],
): Promise<snmp.Varbind[]> =>
  new Promise((resolve, reject) => {
    session.get(oids, (err: Error | null, varbinds: snmp.Varbind[] | undefined) => {
      if (err) return reject(err);
      resolve(varbinds ?? []);
    });
  });

export const snmpSubtreeWalk = (
  session: snmp.Session,
  oid: string,
): Promise<snmp.Varbind[]> =>
  new Promise((resolve) => {
    const results: snmp.Varbind[] = [];
    session.subtree(
      oid,
      20,
      (varbinds: snmp.Varbind[]) => {
        for (const varbind of varbinds) {
          if (!snmp.isVarbindError(varbind)) results.push(varbind);
        }
      },
      () => resolve(results),
    );
  });

export const safeNumber = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  const parsed = Number(
    Buffer.isBuffer(value) ? value.toString() : typeof value === "string" ? value : String(value ?? 0),
  );
  return Number.isFinite(parsed) ? parsed : 0;
};

const isUsefulInterface = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) return false;
  return !/^(lo|loopback|null|veth|docker|br-|virbr|sit|ip6tnl)/i.test(trimmed);
};

export type InterfaceMetric = {
  name: string;
  operStatus: number;
  inOctets: number;
  outOctets: number;
  inDiscards: number;
  inErrors: number;
  outDiscards: number;
  outErrors: number;
};

export const collectInterfaceMetrics = async (session: snmp.Session) => {
  try {
    const [
      descrVbs,
      operStatusVbs,
      inDiscardsVbs,
      inErrorsVbs,
      outDiscardsVbs,
      outErrorsVbs,
      inHcOctetVbs,
      outHcOctetVbs,
      inOctetVbs,
      outOctetVbs,
    ] =
      await Promise.all([
        snmpSubtreeWalk(session, IFACE_OIDS.ifDescr),
        snmpSubtreeWalk(session, IFACE_OIDS.ifOperStatus),
        snmpSubtreeWalk(session, IFACE_OIDS.ifInDiscards),
        snmpSubtreeWalk(session, IFACE_OIDS.ifInErrors),
        snmpSubtreeWalk(session, IFACE_OIDS.ifOutDiscards),
        snmpSubtreeWalk(session, IFACE_OIDS.ifOutErrors),
        snmpSubtreeWalk(session, IFACE_OIDS.ifHCInOctets),
        snmpSubtreeWalk(session, IFACE_OIDS.ifHCOutOctets),
        snmpSubtreeWalk(session, IFACE_OIDS.ifInOctets),
        snmpSubtreeWalk(session, IFACE_OIDS.ifOutOctets),
      ]);

    const interfaces: InterfaceMetric[] = [];

    for (const descrVb of descrVbs) {
      const idx = descrVb.oid.split(".").pop();
      if (!idx) continue;
      const name = descrVb.value?.toString() ?? "";
      if (!isUsefulInterface(name)) continue;

      const hcInOctets = safeNumber(inHcOctetVbs.find((vb) => vb.oid.endsWith(`.${idx}`))?.value);
      const hcOutOctets = safeNumber(outHcOctetVbs.find((vb) => vb.oid.endsWith(`.${idx}`))?.value);
      const fallbackInOctets = safeNumber(inOctetVbs.find((vb) => vb.oid.endsWith(`.${idx}`))?.value);
      const fallbackOutOctets = safeNumber(outOctetVbs.find((vb) => vb.oid.endsWith(`.${idx}`))?.value);

      interfaces.push({
        name,
        operStatus: safeNumber(operStatusVbs.find((vb) => vb.oid.endsWith(`.${idx}`))?.value),
        inDiscards: safeNumber(inDiscardsVbs.find((vb) => vb.oid.endsWith(`.${idx}`))?.value),
        inErrors: safeNumber(inErrorsVbs.find((vb) => vb.oid.endsWith(`.${idx}`))?.value),
        outDiscards: safeNumber(outDiscardsVbs.find((vb) => vb.oid.endsWith(`.${idx}`))?.value),
        outErrors: safeNumber(outErrorsVbs.find((vb) => vb.oid.endsWith(`.${idx}`))?.value),
        inOctets: hcInOctets > 0 ? hcInOctets : fallbackInOctets,
        outOctets: hcOutOctets > 0 ? hcOutOctets : fallbackOutOctets,
      });
    }

    return interfaces;
  } catch {
    return [] as InterfaceMetric[];
  }
};
