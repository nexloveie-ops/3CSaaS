import dns from 'dns';

/** Prefer public resolvers when the local stub (127.0.0.1) refuses SRV/A lookups. */
dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
