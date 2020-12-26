export interface PolygonAggregates {
    ticker: string
    status: string
    queryCount: number
    resultsCount: number
    adjusted: boolean
    results: Aggregate[]
}

export interface Aggregate {
    o: string,
    h: string,
    l: string,
    c: string,
    v: string,
    vw: number,
    t: string,
    n: number
}