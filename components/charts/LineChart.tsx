'use client'

import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

interface LineChartProps {
  data: Array<{ date: string; value: number }>
  width?: number
  height?: number
  margin?: { top: number; right: number; bottom: number; left: number }
  color?: string
  className?: string
}

export default function LineChart({ 
  data, 
  width = 400, 
  height = 300, 
  margin = { top: 20, right: 30, bottom: 40, left: 40 },
  color = '#3b82f6',
  className = ''
}: LineChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!data.length || !svgRef.current) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const chartWidth = width - margin.left - margin.right
    const chartHeight = height - margin.top - margin.bottom

    const x = d3.scaleTime()
      .domain(d3.extent(data, d => new Date(d.date)) as [Date, Date])
      .range([0, chartWidth])

    const y = d3.scaleLinear()
      .domain(d3.extent(data, d => d.value) as [number, number])
      .nice()
      .range([chartHeight, 0])

    const line = d3.line<{ date: string; value: number }>()
      .x(d => x(new Date(d.date)))
      .y(d => y(d.value))
      .curve(d3.curveMonotoneX)

    const area = d3.area<{ date: string; value: number }>()
      .x(d => x(new Date(d.date)))
      .y0(chartHeight)
      .y1(d => y(d.value))
      .curve(d3.curveMonotoneX)

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Add gradient
    const gradient = svg.append('defs')
      .append('linearGradient')
      .attr('id', 'gradient')
      .attr('gradientUnits', 'userSpaceOnUse')
      .attr('x1', 0).attr('y1', 0)
      .attr('x2', 0).attr('y2', chartHeight)

    gradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', color)
      .attr('stop-opacity', 0.3)

    gradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', color)
      .attr('stop-opacity', 0)

    // Add area
    g.append('path')
      .datum(data)
      .attr('fill', 'url(#gradient)')
      .attr('d', area)

    // Add line
    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', 2)
      .attr('d', line)

    // Add dots
    g.selectAll('.dot')
      .data(data)
      .enter().append('circle')
      .attr('class', 'dot')
      .attr('cx', d => x(new Date(d.date)))
      .attr('cy', d => y(d.value))
      .attr('r', 4)
      .attr('fill', color)
      .attr('stroke', 'white')
      .attr('stroke-width', 2)

    // Add x-axis
    g.append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(d3.axisBottom(x).tickFormat(d3.timeFormat('%m/%d')))
      .selectAll('text')
      .style('font-size', '12px')
      .style('fill', '#6b7280')

    // Add y-axis
    g.append('g')
      .call(d3.axisLeft(y))
      .selectAll('text')
      .style('font-size', '12px')
      .style('fill', '#6b7280')

  }, [data, width, height, margin, color])

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className={className}
    />
  )
}
