export type PolygonMarketHolidays = MarketHoliday[]

export interface MarketHoliday {
    exchange: string,
    market: string,
    date: string,
    status: string,
    open?: string,
    close?: string
}