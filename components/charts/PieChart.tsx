'use client'

import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

interface PieChartProps {
  data: Array<{ label: string; value: number; color?: string }>
  width?: number
  height?: number
  innerRadius?: number
  className?: string
}

export default function PieChart({ 
  data, 
  width = 300, 
  height = 300, 
  innerRadius = 0,
  className = ''
}: PieChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!data.length || !svgRef.current) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const radius = Math.min(width, height) / 2 - 20
    const centerX = width / 2
    const centerY = height / 2

    const color = d3.scaleOrdinal()
      .domain(data.map(d => d.label))
      .range(data.map(d => d.color || d3.schemeCategory10[0]))

    const pie = d3.pie<{ label: string; value: number; color?: string }>()
      .value(d => d.value)
      .sort(null)

    const arc = d3.arc<d3.PieArcDatum<{ label: string; value: number; color?: string }>>()
      .innerRadius(innerRadius)
      .outerRadius(radius)

    const labelArc = d3.arc<d3.PieArcDatum<{ label: string; value: number; color?: string }>>()
      .innerRadius(radius * 0.7)
      .outerRadius(radius * 0.7)

    const g = svg.append('g')
      .attr('transform', `translate(${centerX},${centerY})`)

    const arcs = g.selectAll('.arc')
      .data(pie(data))
      .enter().append('g')
      .attr('class', 'arc')

    // Add paths
    arcs.append('path')
      .attr('d', arc)
      .attr('fill', d => color(d.data.label) as string)
      .attr('stroke', 'white')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('mouseover', function(event, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('transform', 'scale(1.05)')
      })
      .on('mouseout', function(event, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('transform', 'scale(1)')
      })

    // Add labels
    arcs.append('text')
      .attr('transform', d => `translate(${labelArc.centroid(d)})`)
      .attr('text-anchor', 'middle')
      .style('font-size', '12px')
      .style('font-weight', '500')
      .style('fill', 'white')
      .text(d => d.value > 0 ? `${d.data.label}` : '')

    // Add percentage labels
    arcs.append('text')
      .attr('transform', d => `translate(${labelArc.centroid(d)})`)
      .attr('dy', '1.2em')
      .attr('text-anchor', 'middle')
      .style('font-size', '10px')
      .style('fill', 'white')
      .text(d => {
        const total = d3.sum(data, d => d.value)
        const percentage = ((d.value / total) * 100).toFixed(1)
        return d.value > 0 ? `${percentage}%` : ''
      })

  }, [data, width, height, innerRadius])

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className={className}
    />
  )
}
