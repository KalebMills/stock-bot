export interface PolygonSnapshot {
    status: string;
    tickers: SnapshotArray[];
}

export interface SnapshotArray {
    day: PolygonSnapshotDay
    lastQuote: PolygonSnapshotLastQuote
    lastTrade: PolygonSnapshotLastTrade
    min: PolygonSnapshotMin,
    prevDay: PolygonSnapshotPrevDay,
    ticker: string
    todaysChange: number
    todaysChangePerc: number
    updated: number
}

export interface PolygonSnapshotDay {
    o: number,
    h: number,
    l: number,
    c: number,
    v: number,
    vw: number
}

export interface PolygonSnapshotLastQuote {
    P: number,
    s: number,
    p: number,
    S: number,
    t: number
}

export interface PolygonSnapshotLastTrade {
    c: string[],
    i: number,
    p: number,
    s: number,
    t: number,
    x: number
}

export interface PolygonSnapshotMin {
    av: number,
    p: number,
    h: number,
    l: number,
    c: number,
    v: number,
    vw: number
}
export interface PolygonSnapshotPrevDay {
    o: number,
    h: number,
    l: number,
    c: number,
    v: number,
    vw: number
}